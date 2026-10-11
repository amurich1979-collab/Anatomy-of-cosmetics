import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchLocalProducts } from "../src/products.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(rootDir, "audit", "c03", "control-queries.json");
const catalogPath = path.join(rootDir, "data", "product-index.json");
const outputPath = path.join(rootDir, "audit", "c03", "evaluation.json");
const markdownPath = path.join(rootDir, "audit", "c03", "evaluation.md");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const increment = (record, key) => { record[key || "unknown"] = (record[key || "unknown"] || 0) + 1; };

const fixture = readJson(fixturePath);
const catalog = readJson(catalogPath);
const catalogById = new Map(catalog.map((product) => [product.id, product]));

const cases = fixture.cases.map((control) => {
  const results = searchLocalProducts(control.query, 8);
  const top = results[0] || null;
  const expected = catalogById.get(control.expectedId) || null;
  const correct = top?.id === control.expectedId;
  return {
    ...control,
    correct,
    resultCount: results.length,
    top: top ? {
      id: top.id,
      brand: top.brand,
      name: top.name,
      code: top.code || null,
      sourceType: top.sourceType || "unknown",
      hasComposition: Boolean(top.composition || top.hasComposition),
      compositionScope: top.compositionScope || "unknown"
    } : null,
    expectedAvailable: Boolean(expected),
    barcodeCardinalityCorrect: control.kind !== "barcode" || (results.length === 1 && correct)
  };
});

const correctCount = cases.filter((item) => item.correct).length;
const top1Accuracy = cases.length ? correctCount / cases.length : 0;
const barcodeCases = cases.filter((item) => item.kind === "barcode");
const sourceCounts = {};
const formulaAvailability = { withComposition: 0, withoutComposition: 0 };
const formulaScopes = {};
for (const item of cases) {
  increment(sourceCounts, item.top?.sourceType || "no_result");
  formulaAvailability[item.top?.hasComposition ? "withComposition" : "withoutComposition"] += 1;
  increment(formulaScopes, item.top?.compositionScope || "unknown");
}

const safetyCases = fixture.safetyCases.map((control) => {
  const results = searchLocalProducts(control.query, 8);
  return {
    ...control,
    passed: control.expected === "no_local_substitute" ? results.length === 0 : false,
    returnedIds: results.map((product) => product.id)
  };
});

const result = {
  schemaVersion: "1.0",
  fixtureHash: sha256(fixturePath),
  catalogHash: sha256(catalogPath),
  population: {
    controlQueries: cases.length,
    nameQueries: cases.filter((item) => item.kind === "name").length,
    barcodeQueries: barcodeCases.length,
    availableCatalogProducts: catalog.length
  },
  searchAccuracy: {
    correctTop1: correctCount,
    total: cases.length,
    top1Accuracy,
    threshold: fixture.acceptanceThreshold,
    passed: top1Accuracy >= fixture.acceptanceThreshold,
    exactBarcodeSingleResult: barcodeCases.every((item) => item.barcodeCardinalityCorrect)
  },
  sourceCoverage: {
    note: "Coverage is reported separately from ranking accuracy and is not an acceptance substitute.",
    resultSourceTypes: sourceCounts,
    formulaAvailability,
    formulaScopes
  },
  safety: {
    allPassed: safetyCases.every((item) => item.passed),
    cases: safetyCases
  },
  failures: cases.filter((item) => !item.correct),
  cases
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

const percent = (value) => `${(value * 100).toFixed(2)}%`;
const lines = [
  "# C03 Search Evaluation",
  "",
  `- Top-1: ${correctCount}/${cases.length} (${percent(top1Accuracy)}), threshold ${percent(fixture.acceptanceThreshold)}: ${result.searchAccuracy.passed ? "PASS" : "FAIL"}`,
  `- Exact barcode returns one card: ${result.searchAccuracy.exactBarcodeSingleResult ? "PASS" : "FAIL"}`,
  `- Missing-product safety cases: ${result.safety.allPassed ? "PASS" : "FAIL"}`,
  `- Formula available in returned cards: ${formulaAvailability.withComposition}/${cases.length}`,
  "",
  "## Source Coverage (separate metric)",
  "",
  ...Object.entries(sourceCounts).sort().map(([source, count]) => `- ${source}: ${count}`),
  "",
  "## Formula Scope (separate metric)",
  "",
  ...Object.entries(formulaScopes).sort().map(([scope, count]) => `- ${scope}: ${count}`),
  "",
  "This is a deterministic development control set over locally available cards, not the held-out C02 final acceptance set."
];
fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`, "utf8");
console.log(lines.slice(0, 6).join("\n"));

if (!result.searchAccuracy.passed || !result.searchAccuracy.exactBarcodeSingleResult || !result.safety.allPassed) {
  process.exitCode = 1;
}
