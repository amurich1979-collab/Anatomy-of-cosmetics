import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicJson } from "./import-cosing-inci-registry.js";
import { validateRegistryDocument } from "../src/services/ingredientSources/inciRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const option = (name) => {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : null;
};
const resolve = (value) => path.resolve(rootDir, value);

const backupPath = resolve(option("backup") || "data/inci-registry.previous.json");
const outputPath = resolve(option("output") || "data/inci-registry.json");
const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const errors = validateRegistryDocument(backup);
if (errors.length) throw new Error(`Backup registry is invalid; refusing restore: ${errors.join("; ")}`);
atomicJson(outputPath, backup);
console.log(JSON.stringify({ restored: path.relative(rootDir, outputPath), registryVersion: backup.registryVersion, records: backup.records.length }, null, 2));
