import assert from "node:assert/strict";
import test from "node:test";
import { analyzeComposition, parseIngredients } from "../src/analyzer.js";

test("T01 baseline: clean INCI retains a split PEG-40 ingredient", () => {
  const ingredients = parseIngredients("Aqua, PEG-\n40 Hydrogenated Castor Oil, Niacinamide");

  assert.deepEqual(ingredients, [
    "Aqua",
    "PEG-40 Hydrogenated Castor Oil",
    "Niacinamide"
  ]);
});

test("T01 baseline: a known local anesthetic is classified as medical, not cosmetic", () => {
  const result = analyzeComposition({
    productName: "Topical anesthetic",
    text: "Aqua, Prilocaine Hydrochloride, Cetyl Palmitate, Phenoxyethanol"
  });

  assert.equal(result.productClassification.type, "local_anesthetic");
  assert.equal(result.productClassification.shouldScoreAsCosmetic, false);
});
