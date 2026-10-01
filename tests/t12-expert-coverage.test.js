import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { analyzeComposition } from "../src/analyzer.js";
import {
  auditLegacyExpertEntries,
  buildCoverageReport,
  buildPriorityBatch,
  classifyCorpusRecord,
  collectFormulaCorpus,
  rankCorpusIngredients
} from "../src/services/expertCoverage.js";
import { claimApplicability, validateExpertKnowledge } from "../src/services/expertRules.js";

const read = (relativePath) => JSON.parse(fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"));
const knowledge = read("data/expert-claims.json");

test("T12: corpus admits real full labels and excludes demos, partial actives and unknown scope", () => {
  assert.deepEqual(classifyCorpusRecord({ id: "demo-x", composition: "Aqua", compositionScope: "full" }), { eligible: false, reason: "demo_formula" });
  assert.deepEqual(classifyCorpusRecord({ id: "real-x", composition: "Aqua", compositionScope: "active_ingredients_only" }), { eligible: false, reason: "partial_active_ingredients_only" });
  assert.deepEqual(classifyCorpusRecord({ id: "real-x", composition: "Aqua", sourceType: "marketplace" }), { eligible: false, reason: "composition_scope_not_verified_full" });
  assert.deepEqual(classifyCorpusRecord({ id: "real-x", composition: "Aqua", compositionScope: "full_label_inci_from_photo" }), { eligible: true, reason: "real_full_composition" });
});

test("T12: priority is frequency-based and never upgrades missing evidence to a fact", () => {
  const corpus = collectFormulaCorpus({ products: [
    { id: "a", name: "A", compositionScope: "full_label_inci_from_photo", composition: "Aqua, Panthenol, Unknownium" },
    { id: "b", name: "B", compositionScope: "full", composition: "Aqua, Glycerin" },
    { id: "demo-c", name: "C", compositionScope: "full", composition: "Niacinamide" }
  ] });
  const ranking = rankCorpusIngredients(corpus);
  assert.equal(ranking[0].name, "Aqua");
  assert.equal(ranking[0].formulaCount, 2);
  const batch = buildPriorityBatch(ranking, knowledge, { checkedAt: "2026-09-29", limit: 25 });
  const unknown = batch.find((item) => item.ingredient === "Unknownium");
  assert.equal(unknown.evidenceStatus, "insufficient_data");
  assert.deepEqual(unknown.effects, []);
  assert.deepEqual(unknown.riskAssessment.statements, []);
  assert.equal(batch.length, ranking.length);
});

test("T12: current legacy audit covers all 122 records and does not treat scores as sourced", () => {
  const legacyAudit = auditLegacyExpertEntries(read("data/ingredients-expert.json"));
  assert.equal(legacyAudit.recordCount, 122);
  assert.equal(legacyAudit.summary.missingSources, 122);
  assert.equal(legacyAudit.summary.unsupportedNumericQualityScores, 122);
  assert.ok(legacyAudit.records.every((record) => record.evidenceStatus === "insufficient_data"));
});

test("T12: report separates name recognition, explanation and domain review", () => {
  const corpus = collectFormulaCorpus({ products: read("data/products.json"), cache: read("data/product-details-cache.json") });
  const ranking = rankCorpusIngredients(corpus);
  const legacyAudit = auditLegacyExpertEntries(read("data/ingredients-expert.json"));
  const priorityBatch = buildPriorityBatch(ranking, knowledge, { checkedAt: "2026-09-29" });
  const report = buildCoverageReport({ corpus, ranking, priorityBatch, knowledge, legacyAudit, checkedAt: "2026-09-29" });
  assert.equal(report.corpus.eligibleRealFullFormulas, 1);
  assert.equal(report.priorityBatch.length, 25);
  assert.ok(report.coverage.nameRecognition.numerator > report.coverage.expertExplanation.numerator);
  assert.equal(report.coverage.domainReviewedExplanation.numerator, 0);
  assert.match(report.coverage.warning, /не считается ростом экспертного покрытия/);
});

test("T12: evidence records require explicit risk and review statuses", () => {
  assert.deepEqual(validateExpertKnowledge(knowledge), []);
  const missingRisk = structuredClone(knowledge);
  delete missingRisk.claims[0].riskAssessment;
  assert.ok(validateExpertKnowledge(missingRisk).some((error) => error.includes("risk assessment")));
  const fakeVerified = structuredClone(knowledge);
  fakeVerified.claims[0].evidenceStatus = "verified";
  assert.ok(validateExpertKnowledge(fakeVerified).some((error) => error.includes("pending claim")));
});

test("T12: product form and unknown concentration prevent silent transfer", () => {
  assert.equal(claimApplicability({ productForm: "emollient cream" }, {}).status, "conditional");
  assert.equal(claimApplicability({ productForm: "emollient cream" }, { productForm: "medicated gel" }).status, "not_applicable");
  assert.equal(claimApplicability({ concentrationPercent: 5 }, { concentrationPercent: "unknown" }).status, "conditional");
});

test("T12: panthenol evidence remains conditional and does not become a product promise", () => {
  const result = analyzeComposition({ formulaScope: "full", text: "Aqua, Panthenol" });
  const claim = result.findings.find((finding) => finding.ruleId === "literature.panthenol.formula-barrier");
  assert.ok(claim);
  assert.equal(claim.evidenceStatus, "review_required");
  assert.equal(claim.statusLabel, "Требует предметной проверки");
  assert.equal(claim.applicability.status, "conditional");
  assert.equal(claim.productEffectConfirmed, false);
  assert.equal(claim.riskAssessment.status, "insufficient_data");
});
