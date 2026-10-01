/*
 * T01 deliberately records desired behaviour that is not implemented yet.
 * This file is NOT part of `npm test`: it is a separate red regression suite.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { analyzeComposition } from "../src/analyzer.js";
import { cleanInciText } from "../src/services/inciCleaner.js";
import { rankSourceProducts } from "../src/services/productSources/index.js";

const TOPICREM_INGREDIENTS = [
  "Aqua/Water",
  "Paraffinum Liquidum (Mineral Oil)",
  "Glycerin",
  "Cetearyl Ethylhexanoate",
  "Isopropyl Isostearate",
  "Urea",
  "Cera Alba (Beeswax)",
  "Palmitic Acid",
  "Stearic Acid",
  "Glyceryl Stearate",
  "PEG-100 Stearate",
  "1,2-Hexanediol",
  "Polysorbate 60",
  "Xanthan Gum",
  "Hydroxyethyl Acrylate/Sodium Acryloyldimethyl Taurate Copolymer",
  "Parfum (Fragrance)",
  "Caprylyl Glycol",
  "Chlorphenesin",
  "Sodium Hydroxide",
  "Sorbitan Isostearate"
];

test("T01-01 Topicrem: dot-separated formula remains 20 discrete ingredients", () => {
  const cleaned = cleanInciText(TOPICREM_INGREDIENTS.join(". "));

  assert.equal(cleaned.ingredients.length, 20, "Each labelled Topicrem position must remain separate.");
  assert.deepEqual(cleaned.ingredients, TOPICREM_INGREDIENTS);
});

test("T01-03 Hamamelis: broad Extract is a suggestion, never a confirmed Bark/Leaf INCI", () => {
  const result = analyzeComposition({ text: "Hamamelis Virginiana Extract" });

  assert.equal(
    result.found.some((ingredient) => /bark\/leaf extract/i.test(ingredient.name)),
    false,
    "A generic Hamamelis Extract must not silently become the different Bark/Leaf Extract INCI."
  );
  assert.ok(
    result.unknown.some((item) => item.name === "Hamamelis Virginiana Extract"),
    "The original ambiguous spelling should remain visible for a user decision."
  );
});

test("T01-04 OCR garbage: unknown words do not become an analyzable formula", () => {
  const cleaned = cleanInciText("Qwertyblender, Zxcvbnformula, Plmoknextract");

  assert.deepEqual(cleaned.ingredients, [], "Unrecognised OCR noise must be rejected before formula analysis.");
});

test("T01-05 EAN trailing text: barcode metadata does not delete the INCI block", () => {
  const cleaned = cleanInciText(
    "INGREDIENTS: Aqua, Glycerin, Niacinamide\nEAN 3337875598763\nManufacturer: Example LLC"
  );

  assert.deepEqual(cleaned.ingredients, ["Aqua", "Glycerin", "Niacinamide"]);
});

test("T01-09 GIGI active-only lists do not receive a full-formula quality score", () => {
  const result = analyzeComposition({
    productName: "GIGI active ingredients only",
    text: "Glycolic Acid, Retinol, Niacinamide"
  });

  assert.equal(
    result.qualitySummary?.score ?? null,
    null,
    "A partial active-ingredient list cannot support a score for the whole formula."
  );
});

test("T01-10 Exact EAN retains a product card even when INCI is absent", () => {
  const ean = "5901234123457";
  const ranked = rankSourceProducts([
    {
      code: ean,
      name: "Metadata-only product",
      brand: "Fixture brand",
      category: "cream",
      composition: ""
    }
  ], ean);

  assert.equal(ranked.length, 1, "An exact EAN match must not be discarded because INCI is unavailable.");
  assert.equal(ranked[0].code, ean);
});
