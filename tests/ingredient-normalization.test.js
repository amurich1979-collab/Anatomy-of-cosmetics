import test from "node:test";
import assert from "node:assert/strict";
import { analyzeComposition } from "../src/analyzer.js";
import { findFormulaAlternatives } from "../src/analogs.js";

function firstFound(text) {
  const result = analyzeComposition({ text });
  assert.equal(result.unknown.length, 0, `Expected no unknown ingredients for ${text}`);
  return result.found[0];
}

test("Hamamelis Virginiana Extract returns a suggested CosIng match", () => {
  const result = analyzeComposition({ text: "Hamamelis Virginiana Extract" });
  assert.equal(result.found.length, 0);
  const item = result.unknown[0];
  assert.equal(item.name, "Hamamelis Virginiana Extract");
  assert.equal(item.status, "suggested");
  assert.equal(item.suggested_match, "Hamamelis Virginiana Bark/Leaf Extract");
  assert.ok(item.match_confidence >= 0.8 && item.match_confidence < 1);
});

test("Hamamelis Virginiana Water stays a separate exact INCI", () => {
  const item = firstFound("Hamamelis Virginiana Water");
  assert.equal(item.name, "Hamamelis Virginiana Water");
  assert.equal(item.dataSource, "INCI registry");
  assert.equal(item.match_type, "exact");
  assert.equal(item.match_confidence, 1);
});

test("Hamamelis Virginiana Leaf Extract stays a separate exact INCI", () => {
  const item = firstFound("Hamamelis Virginiana Leaf Extract");
  assert.equal(item.name, "Hamamelis Virginiana Leaf Extract");
  assert.equal(item.dataSource, "INCI registry");
  assert.equal(item.match_type, "exact");
  assert.equal(item.match_confidence, 1);
});

test("RET Complex is treated as an undisclosed proprietary complex", () => {
  const result = analyzeComposition({ text: "Aqua, RET Complex, Niacinamide" });
  const complex = result.proprietaryComplexes[0];
  const found = result.found.find((item) => item.name === "RET Complex");

  assert.ok(complex);
  assert.equal(complex.name, "RET Complex");
  assert.equal(complex.excludedFromScoring, true);
  assert.equal(found.category, "proprietary_complex");
  assert.equal(found.excludedFromScoring, true);
  assert.equal(found.roles.length, 0);
  assert.equal(result.groups.some((group) => group.items.includes("RET Complex")), false);
  assert.equal(found.ingredient_quality_score, null);
});

test("legacy unsourced quality scores are not exposed as an expert assessment", () => {
  const result = analyzeComposition({ formulaScope: "full", text: "Aqua, Glycerin, Niacinamide, Panthenol, Phenoxyethanol" });
  const niacinamide = result.found.find((item) => item.name === "Niacinamide");

  assert.equal(result.qualitySummary.score, null);
  assert.equal(result.qualitySummary.totalIngredients, 5);
  assert.equal(result.qualitySummary.unknownCount, 0);
  assert.equal(niacinamide.ingredient_quality_score, null);
  assert.ok(niacinamide.findings.some((item) => item.ruleId === "literature.niacinamide.appearance" && item.review.status === "pending"));
  assert.ok(niacinamide.quality_note);
});

test("local anesthetic formulas are not treated as ordinary skin care", () => {
  const text = "Aqua, Frostoin, Prilocaine Hydrochloride, Propylene Glycol, Sodium Hydroxide, Cetyl Palmitate, C10-16 Alkyl Glucoside, C14-22 Alcohols, Hydroxyethylcellulose, Phenoxyethanol, Ethylhexylglycerin";
  const result = analyzeComposition({ text });

  assert.equal(result.productSafety.shouldScoreAsCosmetic, false);
  assert.equal(result.productSafety.type, "local_anesthetic");
  assert.equal(result.formulaType, "местный анестетик / процедурный препарат");
  assert.equal(result.score.label, "не оценивать как уходовое средство");
  assert.equal(result.hydration_score, null);
  assert.equal(result.active_score, null);
  assert.deepEqual(result.assessment, { status: "not_assessed", reason: "non_cosmetic_formula" });
  assert.equal(result.qualitySummary.score, null);
  assert.equal(result.qualitySummary.label, "не оценивается как косметическая формула");
  assert.ok(result.summary.includes("не обычная косметическая формула"));
  assert.ok(result.warnings.some((item) => item.includes("Не использовать как ежедневное уходовое средство")));
  assert.ok(result.routineAdvice.every((item) => !item.includes("обычное новое средство")));
  assert.deepEqual(findFormulaAlternatives({ text }), []);
});
