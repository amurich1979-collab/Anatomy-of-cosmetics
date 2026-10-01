import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256, validateRegistryDocument } from "../src/services/ingredientSources/inciRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const option = (name) => {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : null;
};
const required = (name) => {
  const value = option(name);
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
};
const resolve = (value) => path.resolve(rootDir, value);
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const normalized = (value) => clean(value).toLocaleLowerCase("en-US");
const unique = (values) => [...new Set(values.map(clean).filter(Boolean))];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") { cell += "\""; index += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const valueAt = (row, headers, names) => {
  const header = names.find((name) => headers.has(name));
  return header ? clean(row[headers.get(header)]) : "";
};

function recordFromRow(row, headers, sourceId, rowNumber) {
  const name = valueAt(row, headers, ["INCI name"]);
  if (!name) return null;
  const aliases = unique([valueAt(row, headers, ["INN name"]), valueAt(row, headers, ["Ph. Eur. Name"])]).filter((alias) => normalized(alias) !== normalized(name));
  const functionText = valueAt(row, headers, ["Function"]);
  const cas = valueAt(row, headers, ["CAS Number", "CAS No", "CAS"]);
  const restriction = valueAt(row, headers, ["Restriction", "Restrictions"]);
  return {
    name,
    aliases,
    functions: unique(functionText.split(",")),
    cas: cas || null,
    restrictions: restriction ? [restriction] : null,
    provenance: {
      sourceId,
      sourceRecord: { row: rowNumber, reference: valueAt(row, headers, ["COSING Ref No"]) || null },
      fields: {
        aliases: headers.has("INN name") || headers.has("Ph. Eur. Name") ? "source" : "not_available",
        functions: headers.has("Function") ? "source" : "not_available",
        cas: headers.has("CAS Number") || headers.has("CAS No") || headers.has("CAS") ? "source" : "not_available",
        restrictions: headers.has("Restriction") || headers.has("Restrictions") ? "source" : "not_available"
      }
    }
  };
}

function mergeExactRecords(existing, incoming) {
  const restrictions = unique([...(existing.restrictions || []), ...(incoming.restrictions || [])]);
  return {
    ...existing,
    aliases: unique([...existing.aliases, ...incoming.aliases]),
    functions: unique([...existing.functions, ...incoming.functions]),
    cas: existing.cas || incoming.cas || null,
    restrictions: restrictions.length ? restrictions : null,
    provenance: {
      ...existing.provenance,
      sourceRecord: {
        row: existing.provenance.sourceRecord.row,
        reference: existing.provenance.sourceRecord.reference,
        mergedRows: [...new Set([...(existing.provenance.sourceRecord.mergedRows || [existing.provenance.sourceRecord.row]), incoming.provenance.sourceRecord.row])]
      }
    }
  };
}

export function buildRegistryDocument(csv, source, retrievedAt = null) {
  const rows = parseCsv(csv);
  const headerIndex = rows.findIndex((row) => row[0] === "COSING Ref No");
  if (headerIndex === -1) throw new Error("CSV header COSING Ref No was not found");
  const headers = new Map(rows[headerIndex].map((name, index) => [clean(name), index]));
  if (!headers.has("INCI name")) throw new Error("CSV header INCI name was not found");
  const records = new Map();
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const record = recordFromRow(row, headers, source.id, headerIndex + offset + 2);
    if (!record) return;
    const recordKey = normalized(record.name);
    records.set(recordKey, records.has(recordKey) ? mergeExactRecords(records.get(recordKey), record) : record);
  });
  const document = {
    schemaVersion: "1.0",
    registryVersion: source.version || `sha256:${sha256(csv).slice(0, 16)}`,
    source: { ...source, retrievedAt: retrievedAt || source.retrievedAt || null, sha256: sha256(csv) },
    records: [...records.values()].sort((left, right) => left.name.localeCompare(right.name, "en"))
  };
  const errors = validateRegistryDocument(document);
  if (errors.length) throw new Error(`Generated registry failed schema validation: ${errors.join("; ")}`);
  return document;
}

export function documentDiff(previous, next) {
  const before = new Map((previous?.records || []).map((record) => [normalized(record.name), record]));
  const after = new Map(next.records.map((record) => [normalized(record.name), record]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [name, record] of after) {
    if (!before.has(name)) { added.push(record.name); continue; }
    const old = before.get(name);
    const fields = ["aliases", "functions", "cas", "restrictions"].filter((field) => JSON.stringify(old[field]) !== JSON.stringify(record[field]));
    if (fields.length) changed.push({ name: record.name, fields });
  }
  for (const [name, record] of before) if (!after.has(name)) removed.push(record.name);
  return { previousCount: before.size, nextCount: after.size, added, removed, changed };
}

export function atomicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "AnatomyCosmetology/registry-import" } });
  if (!response.ok) throw new Error(`Cannot download source: ${response.status}`);
  return response.text();
}

async function main() {
  const input = option("input");
  const url = option("url");
  if (Boolean(input) === Boolean(url)) throw new Error("Specify exactly one of --input or --url");
  const sourcePath = resolve(required("source"));
  const outputPath = resolve(option("output") || "data/inci-registry.json");
  const backupPath = resolve(option("backup") || "data/inci-registry.previous.json");
  const reportPath = resolve(option("report") || "data/inci-registry-import-report.json");
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  if (url && source.url !== url) throw new Error("--url must equal source.url in the source manifest");
  const csv = input ? fs.readFileSync(resolve(input), "utf8") : await fetchText(url);
  const next = buildRegistryDocument(csv, source, option("retrieved-at"));
  const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : null;
  if (previous) {
    const previousErrors = validateRegistryDocument(previous);
    if (previousErrors.length) throw new Error(`Existing registry is invalid; refusing overwrite: ${previousErrors.join("; ")}`);
  }
  const diff = documentDiff(previous, next);
  const report = {
    schemaVersion: "1.0",
    generatedAt: option("retrieved-at") || null,
    input: { kind: input ? "file" : "url", sha256: sha256(csv), sourceId: source.id, sourceType: source.type, sourceUrl: source.url },
    output: { registryVersion: next.registryVersion, sourceSha256: next.source.sha256, records: next.records.length },
    diff
  };
  if (previous) atomicJson(backupPath, previous);
  atomicJson(outputPath, next);
  atomicJson(reportPath, report);
  console.log(JSON.stringify({ output: path.relative(rootDir, outputPath), backup: previous ? path.relative(rootDir, backupPath) : null, report: path.relative(rootDir, reportPath), records: next.records.length, diff }, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
