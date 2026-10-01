import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { analyzeComposition } from "../src/analyzer.js";
import { hasProductIdentityEvidence } from "../src/products.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../audit/t18/corpus-manifest.json", import.meta.url), "utf8"));
const evaluation = JSON.parse(fs.readFileSync(new URL("../audit/t18/evaluation.json", import.meta.url), "utf8"));
const finalOcr = JSON.parse(fs.readFileSync(new URL("../audit/t18/ocr-live-final.json", import.meta.url), "utf8"));
const products = JSON.parse(fs.readFileSync(new URL("../data/products.json", import.meta.url), "utf8"));

test("T18: candidate corpus reaches 120 licensed, reproducible, brand-disjoint records", () => {
  assert.equal(manifest.entries.length, 120);
  assert.equal(manifest.counts.setup, 80);
  assert.equal(manifest.counts.final, 40);
  const setupBrands = new Set(manifest.entries.filter((item) => item.partition === "setup").map((item) => item.splitGroup));
  const finalBrands = new Set(manifest.entries.filter((item) => item.partition === "final").map((item) => item.splitGroup));
  assert.deepEqual([...setupBrands].filter((brand) => finalBrands.has(brand)), []);
  for (const entry of manifest.entries) {
    assert.match(entry.barcode, /^\d{8,14}$/);
    assert.match(entry.inputs.ingredientImage.url, /^https:\/\/images\.openbeautyfacts\.org\//);
    assert.ok(entry.inputs.sourceText.length >= 3);
    assert.equal(entry.source.dataLicense, "ODbL");
    assert.equal(entry.source.imageLicense, "CC BY-SA");
  }
});

test("T18: unreviewed source transcriptions cannot be reported as final gold accuracy", () => {
  assert.equal(manifest.counts.humanReviewed, 0);
  assert.equal(evaluation.benchmarkStatus, "candidate_only_no_human_reviewed_gold");
  assert.equal(evaluation.humanReviewedGold.targetStatus, "not_evaluated");
  assert.equal(evaluation.humanReviewedGold.records, 0);
});

test("T18: measured diagnostics retain failed targets instead of claiming benchmark success", () => {
  const finalText = evaluation.provisionalSourceTranscriptionDiagnostic.byPartition.final;
  assert.equal(finalText.targetStatus, "not_met_on_this_sample");
  assert.ok(finalText.precision < finalText.target.precision);
  assert.ok(finalText.recall < finalText.target.recall);
  assert.equal(finalOcr.partition, "final");
  assert.equal(finalOcr.status, "provisional_external_transcription_not_human_gold");
  assert.ok(finalOcr.ingredientImages.precision < 0.99);
  assert.ok(finalOcr.ingredientImages.recall < 0.95);
  assert.equal(finalOcr.frontImages.analysisCompleted, 0);
});

test("T18: safety artifact has no hidden ingredients, unsafe score, or recommendation contradiction", () => {
  assert.equal(evaluation.safety.failed, 0);
  for (const item of evaluation.safety.cases) {
    assert.equal(item.passed, true);
    assert.deepEqual(item.actual.hiddenAdditions, []);
    assert.equal(item.actual.score, null);
    assert.equal(item.actual.routineAdviceCount, 0);
    assert.equal(item.actual.positiveRecommendationCount, 0);
  }
});

test("T18: generic retinol-serum words cannot select another brand formula", () => {
  const correct = { brand: "INGU", name: "Green Tea Retinol Serum Shot" };
  const wrong = { brand: "The Inkey List", name: "Retinol Serum" };
  const label = "INGU GREEN TEA RETINOL SERUM SHOT";
  assert.equal(hasProductIdentityEvidence(label, correct), true);
  assert.equal(hasProductIdentityEvidence(label, wrong), false);
  assert.equal(hasProductIdentityEvidence("RETINOL SERUM", wrong), false);
  assert.equal(hasProductIdentityEvidence("GREEN TEA SCENT", { brand: "Dove", name: "Go Fresh Cucumber & Green Tea Scent" }), false);
  assert.equal(hasProductIdentityEvidence("Trixosil", { brand: "Trixosil", name: "5% Professional Hair Growth Complex" }), true);
});

test("T18: real safety references refuse cosmetic scoring where evidence is incomplete or medical", () => {
  const anesthetic = analyzeComposition({
    text: "Aqua, Frostoin, Prilocaine Hydrochloride, Propylene Glycol, Sodium Hydroxide, CetylPalmitate, C10-16 Alkyl Glucoside, C14-22 Alcohols, Hydroxyethylcellulose, Phenoxyethanol",
    productName: "User photographed anesthetic",
    formulaScope: "full"
  });
  assert.equal(anesthetic.productSafety.type, "local_anesthetic");
  assert.equal(anesthetic.assessment.status, "not_assessed");
  assert.equal(anesthetic.score.score, null);
  assert.deepEqual(anesthetic.routineAdvice, []);
  assert.deepEqual(anesthetic.positives, []);

  const gigi = products.find((item) => item.id === "gigi-27116-acnon-multi-peeling");
  const activeOnly = analyzeComposition({ text: gigi.composition, productName: `${gigi.brand} ${gigi.name}`, formulaScope: "active_only" });
  assert.equal(activeOnly.assessment.status, "not_assessed");
  assert.equal(activeOnly.assessment.reason, "active_only_formula");
  assert.equal(activeOnly.score.score, null);
  assert.deepEqual(activeOnly.routineAdvice, []);
});
