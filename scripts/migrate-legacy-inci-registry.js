import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicJson } from "./import-cosing-inci-registry.js";
import { sha256, validateRegistryDocument } from "../src/services/ingredientSources/inciRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const option = (name) => {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : null;
};
const resolve = (value) => path.resolve(rootDir, value);
const registryPath = resolve(option("input") || "data/inci-registry.json");
const outputPath = resolve(option("output") || "data/inci-registry.json");
const legacyArchivePath = resolve(option("legacy-archive") || "data/inci-registry.legacy-array.json");
const reportPath = resolve(option("report") || "data/inci-registry-migration-report.json");
const sourcePath = path.join(rootDir, "data", "inci-registry-legacy-source.json");
const uniqueText = (items) => [...new Map((items || [])
  .map((item) => String(item || "").trim())
  .filter(Boolean)
  .map((item) => [item.toLocaleLowerCase("en-US"), item])).values()];

function main() {
  const raw = fs.readFileSync(registryPath, "utf8");
  const legacy = JSON.parse(raw);
  if (!Array.isArray(legacy)) throw new Error("Expected the pre-T11 registry array");
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const document = {
    schemaVersion: "1.0",
    registryVersion: `legacy-snapshot:${sha256(raw).slice(0, 16)}`,
    source: {
      ...source,
      sha256: sha256(raw),
      checksumScope: "normalized legacy registry JSON snapshot; not a downloaded source CSV"
    },
    records: legacy.map((record) => ({
      name: record.name,
      aliases: uniqueText(record.aliases),
      functions: uniqueText(record.functions),
      cas: null,
      restrictions: null,
      provenance: {
        sourceId: source.id,
        sourceRecord: { row: null, reference: null },
        fields: { aliases: "source", functions: "source", cas: "not_available", restrictions: "not_available" }
      }
    }))
  };
  const errors = validateRegistryDocument(document);
  if (errors.length) throw new Error(`Legacy registry migration failed validation: ${errors.join("; ")}`);
  atomicJson(legacyArchivePath, legacy);
  atomicJson(outputPath, document);
  atomicJson(reportPath, {
    schemaVersion: "1.0",
    migration: "legacy-array-to-registry-document",
    legacyArchive: path.relative(rootDir, legacyArchivePath),
    source: document.source,
    registryVersion: document.registryVersion,
    records: document.records.length,
    limitations: ["The legacy snapshot did not contain a source export date, source version, CAS, restrictions, or per-row source locators; these remain null/not_available."]
  });
  console.log(JSON.stringify({ migrated: document.records.length, legacyArchive: path.relative(rootDir, legacyArchivePath), output: path.relative(rootDir, outputPath), registryVersion: document.registryVersion }, null, 2));
}

main();
