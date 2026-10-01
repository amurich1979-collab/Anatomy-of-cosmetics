import assert from "node:assert/strict";
import test from "node:test";
import { createAnalysisContract, validateAnalysisContract } from "../src/analysisContract.js";
import { analyzeComposition } from "../src/analyzer.js";

test("T09: registry-only INCI has functions but no expert quality or zero-risk confirmation", () => {
  const analysis = analyzeComposition({
    formulaScope: "full",
    text: "Hydroxyethylcellulose, C10-16 Alkyl Glucoside, Potassium Phosphate"
  });

  assert.ok(analysis.found.every((item) => item.dataSource === "INCI registry" && item.referenceType === "inci_registry"));
  assert.ok(analysis.found.every((item) => item.ingredient_quality_score === null));
  assert.equal(analysis.qualitySummary.score, null);
  assert.equal(analysis.qualitySummary.status, "not_assessed");
  assert.equal(analysis.qualitySummary.reason, "registry_only_no_expert_assessment");
  assert.equal(analysis.score.score, null);
  assert.equal(analysis.expertScores.irritation_risk, null);
  assert.deepEqual(analysis.routineAdvice, []);
});

test("T09: unresolved tokens do not become a 0-100 assessment or routine advice", () => {
  const analysis = analyzeComposition({
    text: "Aqua, Glycerin, Nonsensium, Fictitiousol, Unknownate"
  });

  assert.equal(analysis.unknown.length, 3);
  assert.equal(analysis.score.score, null);
  assert.equal(analysis.score.status, "not_assessed");
  assert.equal(analysis.expertScores.hydration_score, null);
  assert.equal(analysis.expertScores.irritation_risk, null);
  assert.deepEqual(analysis.routineAdvice, []);
  assert.match(analysis.summary, /не оцениваются/i);
  assert.doesNotMatch(analysis.summary, /красных флагов/i);
});

test("T09: an unverified formula scope does not receive a global score", () => {
  const analysis = analyzeComposition({
    text: "Aqua, Glycerin, Niacinamide, Panthenol, Phenoxyethanol"
  });

  assert.equal(analysis.assessment.status, "not_assessed");
  assert.equal(analysis.assessment.reason, "insufficient_formula_completeness");
  assert.equal(analysis.score.score, null);
  assert.equal(analysis.qualitySummary.score, null);
});

test("T09: an active-only list is not evaluated as a whole formula", () => {
  const analysis = analyzeComposition({
    productName: "GIGI active ingredients only",
    text: "Glycolic Acid, Retinol, Niacinamide"
  });

  assert.equal(analysis.assessment.status, "not_assessed");
  assert.equal(analysis.assessment.reason, "active_only_formula");
  assert.equal(analysis.score.score, null);
  assert.equal(analysis.qualitySummary.score, null);
  assert.deepEqual(analysis.routineAdvice, []);
});

test("T09: INCI order exposes no inferred concentration threshold", () => {
  const analysis = analyzeComposition({
    formulaScope: "full",
    text: "Aqua, Glycerin, Niacinamide, Panthenol, Phenoxyethanol"
  });

  assert.ok(analysis.found.every((item) => item.concentration === null));
  assert.ok(analysis.found.every((item) => item.concentrationAssessment?.status === "not_assessed"));
  assert.ok(analysis.found.every((item) => !/1%|концентрационн/i.test(String(item.concentrationAssessment?.reason))));
});

test("T09: the contract preserves an explicit not_assessed reason", () => {
  const analysis = analyzeComposition({ text: "Aqua, Glycerin, Nonsensium, Fictitiousol, Unknownate" });
  const contract = createAnalysisContract({
    analysis,
    request: { text: "Aqua, Glycerin, Nonsensium, Fictitiousol, Unknownate" }
  });

  assert.deepEqual(contract.assessment, {
    status: "not_assessed",
    reason: "unresolved_ingredients"
  });
  assert.equal(validateAnalysisContract(contract).valid, true);
});
