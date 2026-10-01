import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadInciRegistry,
  readJsonFile,
  validateLocalAdditionsDocument,
  validateRegistryDocument
} from "../src/services/ingredientSources/inciRegistry.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(rootDir, "scripts", "import-cosing-inci-registry.js");
const restoreScript = path.join(rootDir, "scripts", "restore-inci-registry-backup.js");
const fixture = path.join(rootDir, "tests", "fixtures", "inci-registry-mini.csv");
const source = path.join(rootDir, "tests", "fixtures", "inci-registry-mini-source.json");
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "anatomy-inci-t11-"));

function file(name) {
  return path.join(testDir, name);
}

function runImport(input = fixture) {
  return spawnSync(process.execPath, [
    script,
    `--input=${input}`,
    `--source=${source}`,
    `--output=${file("registry.json")}`,
    `--backup=${file("registry.previous.json")}`,
    `--report=${file("report.json")}`,
    "--retrieved-at=2026-09-29T12:00:00.000Z"
  ], { cwd: rootDir, encoding: "utf8" });
}

function localAdditions() {
  return {
    schemaVersion: "1.0",
    version: "test-local-1",
    aliases: [{
      alias: "test water",
      target: "Aqua",
      reviewStatus: "unreviewed",
      provenance: { kind: "test", note: "Fixture-local alias", addedAt: "2026-09-29" }
    }],
    suggestions: [{
      alias: "hamamelis virginiana extract",
      target: "Hamamelis Virginiana Bark/Leaf Extract",
      confidence: 0.88,
      reviewStatus: "unreviewed",
      provenance: { kind: "test", note: "Fixture-local suggestion", addedAt: "2026-09-29" }
    }]
  };
}

test("T11: importing a small fixture is reproducible and records source provenance", () => {
  const result = runImport();
  assert.equal(result.status, 0, result.stderr);
  const document = readJsonFile(file("registry.json"));
  assert.deepEqual(validateRegistryDocument(document), []);
  assert.equal(document.registryVersion, "fixture-v1");
  assert.equal(document.source.type, "test_fixture");
  assert.equal(document.source.exportedAt, "2026-09-01");
  assert.equal(document.source.retrievedAt, "2026-09-29T12:00:00.000Z");
  assert.match(document.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(document.records.length, 4);
  const aqua = document.records.find((record) => record.name === "Aqua");
  assert.deepEqual(aqua.aliases, ["Water"]);
  assert.deepEqual(aqua.functions, ["SOLVENT", "SKIN CONDITIONING"]);
  assert.equal(aqua.cas, "7732-18-5");
  assert.equal(aqua.restrictions, null);
  assert.equal(aqua.provenance.sourceId, document.source.id);
  assert.ok(aqua.provenance.sourceRecord.mergedRows.includes(2));
  assert.equal(aqua.provenance.fields.cas, "source");
  assert.equal(aqua.provenance.fields.restrictions, "source");
  assert.equal(document.records.find((record) => record.name === "Hamamelis Virginiana Water").cas, null);
  assert.equal(document.records.find((record) => record.name === "Hamamelis Virginiana Water").restrictions, null);
  const report = readJsonFile(file("report.json"));
  assert.deepEqual(report.diff, { previousCount: 0, nextCount: 4, added: document.records.map((record) => record.name), removed: [], changed: [] });
});

test("T11: a valid subsequent import writes a diff and keeps the previous registry as backup", () => {
  const modified = file("modified.csv");
  fs.writeFileSync(modified, fs.readFileSync(fixture, "utf8").replace("SOLVENT", "EMOLLIENT"), "utf8");
  const before = fs.readFileSync(file("registry.json"), "utf8");
  const result = runImport(modified);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(file("registry.previous.json"), "utf8"), before);
  const report = readJsonFile(file("report.json"));
  assert.equal(report.diff.previousCount, 4);
  assert.equal(report.diff.nextCount, 4);
  assert.deepEqual(report.diff.changed, [{ name: "Aqua", fields: ["functions"] }]);
});

test("T11: malformed input cannot replace the last correct registry or its backup", () => {
  const malformed = file("malformed.csv");
  fs.writeFileSync(malformed, "not,a,CosIng,file\n", "utf8");
  const registryBefore = fs.readFileSync(file("registry.json"), "utf8");
  const backupBefore = fs.readFileSync(file("registry.previous.json"), "utf8");
  const reportBefore = fs.readFileSync(file("report.json"), "utf8");
  const result = runImport(malformed);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /header COSING Ref No/i);
  assert.equal(fs.readFileSync(file("registry.json"), "utf8"), registryBefore);
  assert.equal(fs.readFileSync(file("registry.previous.json"), "utf8"), backupBefore);
  assert.equal(fs.readFileSync(file("report.json"), "utf8"), reportBefore);
});

test("T11: a schema-valid previous registry can be restored deterministically", () => {
  const result = spawnSync(process.execPath, [
    restoreScript,
    `--backup=${file("registry.previous.json")}`,
    `--output=${file("restored.json")}`
  ], { cwd: rootDir, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(file("restored.json"), "utf8"), fs.readFileSync(file("registry.previous.json"), "utf8"));
});

test("T11: local aliases and suggestions remain separate from imported data and plant forms remain distinct", () => {
  const additionsPath = file("local-additions.json");
  const additions = localAdditions();
  fs.writeFileSync(additionsPath, `${JSON.stringify(additions, null, 2)}\n`, "utf8");
  const snapshot = loadInciRegistry({ registryPath: file("registry.json"), localAdditionsPath: additionsPath });
  const aqua = snapshot.records.find((record) => record.name === "Aqua");
  assert.deepEqual(aqua.importedAliases, ["Water"]);
  assert.equal(aqua.localAliases[0].alias, "test water");
  assert.ok(aqua.aliases.includes("test water"));
  assert.notEqual(snapshot.records.find((record) => record.name === "Hamamelis Virginiana Water"), snapshot.records.find((record) => record.name === "Hamamelis Virginiana Leaf Extract"));
  assert.ok(snapshot.records.some((record) => record.name === "Hamamelis Virginiana Bark/Leaf Extract"));
  const wrongTarget = structuredClone(additions);
  wrongTarget.aliases[0].target = "Missing Ingredient";
  const names = new Set(snapshot.document.records.map((record) => record.name.toLowerCase()));
  assert.ok(validateLocalAdditionsDocument(wrongTarget, names).some((error) => /not a canonical imported INCI/.test(error)));
});
