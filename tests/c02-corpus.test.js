import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createManifest, stableHash, validateApprovedAnnotation } from "../scripts/lib/c02-corpus.mjs";

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../audit/c02/${name}`, import.meta.url), "utf8"));
const snapshot = read("source-snapshot.json");
const manifest = read("corpus-manifest.json");
const annotations = read("annotations.json");
const report = read("quality-report.json");
const challenges = read("challenge-cases.json");

test("C02: frozen snapshot produces the same 200-record corpus", () => {
  const first = createManifest(snapshot);
  const second = createManifest(snapshot);
  assert.equal(stableHash(first), stableHash(second));
  assert.equal(stableHash(first), stableHash(manifest));
  assert.equal(manifest.entries.length, 200);
  assert.equal(manifest.counts.setup, 150);
  assert.equal(manifest.counts.final, 50);
});

test("C02: final split is isolated by brand group", () => {
  const setup = new Set(manifest.entries.filter((item) => item.partition === "setup").map((item) => item.splitGroup));
  const final = new Set(manifest.entries.filter((item) => item.partition === "final").map((item) => item.splitGroup));
  assert.deepEqual([...final].filter((group) => setup.has(group)), []);
  assert.deepEqual(report.reproducibility.splitLeakageGroups, []);
});

test("C02: source transcription is candidate material, never manual OCR gold", () => {
  assert.equal(manifest.counts.remoteIngredientPhotos, 200);
  assert.equal(manifest.counts.independentManualPhotoTranscriptions, 0);
  for (const entry of manifest.entries) {
    assert.equal(entry.inputs.externalCatalogTranscription.kind, "external_catalog_transcription_not_gold");
    assert.equal(entry.inputs.externalCatalogTranscription.formulaScope, "unknown");
    assert.equal(entry.reviewState.formulaCompleteness, null);
  }
  assert.equal(report.ocr.status, "not_evaluated");
  assert.equal(report.ocr.goldRecords, 0);
  assert.equal(report.ocr.precision, null);
  assert.equal(report.ocr.recall, null);
});

test("C02: blank annotations preserve unknowns and fail closed", () => {
  assert.equal(annotations.annotations.length, 200);
  for (const annotation of annotations.annotations) {
    assert.equal(annotation.status, "pending");
    assert.equal(annotation.purpose, null);
    assert.equal(annotation.category, null);
    assert.equal(annotation.formula.scope, null);
    assert.equal(validateApprovedAnnotation(annotation).eligible, false);
  }
  assert.equal(report.formulaCompleteness.status, "not_evaluated");
  assert.equal(report.identification.humanReviewedAccuracy.status, "not_evaluated");
  assert.ok(report.externalBlockers.some((item) => item.code === "independent_manual_gold_shortfall"));
});

test("C02: provenance, rights and challenge classes are explicit", () => {
  assert.equal(new Set(manifest.entries.map((item) => item.id)).size, 200);
  assert.equal(new Set(manifest.entries.map((item) => item.barcode)).size, 200);
  for (const entry of manifest.entries) {
    assert.equal(entry.provenance.dataLicense, "ODbL");
    assert.equal(entry.provenance.imageLicense, "CC BY-SA");
    assert.match(entry.inputs.ingredientPhoto.url, /^https:\/\/images\.openbeautyfacts\.org\//u);
  }
  assert.deepEqual(new Set(challenges.cases.map((item) => item.type)), new Set(["medical_misclassification", "partial_formula", "conflicting_sources"]));
});
