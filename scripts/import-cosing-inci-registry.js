import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const outputPath = path.join(rootDir, "data", "inci-registry.json");

const COSING_CSV_URL =
  "https://raw.githubusercontent.com/openfoodfacts/openbeautyfacts/develop/cosing/COSING_Ingredients-Fragrance.Inventory_v2.csv";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function cleanValue(value) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return clean && clean !== "-" ? clean : "";
}

function titleCaseInci(value) {
  return cleanValue(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function unique(items) {
  return [...new Set(items.map(cleanValue).filter(Boolean))];
}

function normalizeKey(value) {
  return cleanValue(value).toLowerCase();
}

function toRegistryRecord(row, headers) {
  const get = (name) => cleanValue(row[headers.get(name)]);
  const name = titleCaseInci(get("INCI name"));
  if (!name) return null;

  const aliases = unique([
    get("INN name"),
    get("Ph. Eur. Name")
  ]).filter((alias) => normalizeKey(alias) !== normalizeKey(name));

  const functions = unique(
    get("Function")
      .split(",")
      .map((item) => item.trim())
  );

  return { name, aliases, functions };
}

async function main() {
  const response = await fetch(COSING_CSV_URL, {
    headers: {
      "User-Agent": "AnatomyCosmetology/0.1 INCI registry import"
    }
  });

  if (!response.ok) {
    throw new Error(`Cannot download CosIng CSV: ${response.status}`);
  }

  const csv = await response.text();
  const rows = parseCsv(csv);
  const headerIndex = rows.findIndex((row) => row[0] === "COSING Ref No");
  if (headerIndex === -1) {
    throw new Error("CosIng CSV header was not found.");
  }

  const headers = new Map(rows[headerIndex].map((name, index) => [name, index]));
  const byName = new Map();

  rows.slice(headerIndex + 1).forEach((row) => {
    const record = toRegistryRecord(row, headers);
    if (!record) return;

    const key = normalizeKey(record.name);
    const existing = byName.get(key);
    if (existing) {
      existing.aliases = unique([...existing.aliases, ...record.aliases]);
      existing.functions = unique([...existing.functions, ...record.functions]);
    } else {
      byName.set(key, record);
    }
  });

  const registry = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(`Imported ${registry.length} INCI records to ${path.relative(rootDir, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
