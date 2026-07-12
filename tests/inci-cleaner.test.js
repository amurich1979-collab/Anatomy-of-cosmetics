import test from "node:test";
import assert from "node:assert/strict";
import { analyzeComposition } from "../src/analyzer.js";
import { cleanInciText } from "../src/services/inciCleaner.js";

const TRIXOSIL_OCR = `
Trixosil
5% professional complex
Состав (INCI): Aqua, Isopropyl Alcohol, Pyrrolidinyl Diaminopyrimidine Oxide,
Botnoyl Tripeptide-1, Apigenin, Oleanolic Acid, Butylene Glycol,
PPG-26-Buteth-26, PEG-
40 Hydrogenated
Castor Oil, Adenosine, Nacinamide, Copper Tripeptide-1,
Camellia Sinensis (Green Tea) Leaf Extract, Panthenol,
Phenoxyethanal, Ethyherlylglycerin, Disodium EDTA
Меры предосторожности.
Только для наружного применения.
Производитель: ООО Эталон Косметик, Московская область.
Barcode 4601234567890
50 мл
`;

test("cleanInciText extracts only the INCI block from real-like OCR", () => {
  const cleaned = cleanInciText(TRIXOSIL_OCR);

  assert.ok(cleaned.extractedBlock.includes("Aqua"));
  assert.equal(cleaned.extractedBlock.includes("Производитель"), false);
  assert.equal(cleaned.extractedBlock.includes("Barcode"), false);
  assert.equal(cleaned.ingredients.includes("PEG-40 Hydrogenated Castor Oil"), true);
  assert.equal(cleaned.ingredients.includes("Niacinamide"), true);
  assert.equal(cleaned.ingredients.includes("Phenoxyethanol"), true);
  assert.equal(cleaned.ingredients.includes("Ethylhexylglycerin"), true);
  assert.ok(cleaned.confidence > 0.7);
});

test("OCR dictionary records automatic corrections", () => {
  const cleaned = cleanInciText("INCI: Nacinamide, Phenoxyethanal, Hydrogenated Castor Of, Ethyherlylglycerin");
  const corrected = cleaned.autoCorrections.map((item) => item.corrected);

  assert.ok(corrected.includes("Niacinamide"));
  assert.ok(corrected.includes("Phenoxyethanol"));
  assert.ok(corrected.includes("Hydrogenated Castor Oil"));
  assert.ok(corrected.includes("Ethylhexylglycerin"));
});

test("fuzzy matches between 80 and 95 percent are suggestions, not silent corrections", () => {
  const cleaned = cleanInciText("INCI: Phenoxyethanil, Niacinamlde");

  assert.ok(cleaned.ingredients.includes("Phenoxyethanil"));
  assert.ok(cleaned.ingredients.includes("Niacinamlde"));
  assert.ok(cleaned.suggestions.some((item) => item.suggested_match === "Phenoxyethanol" && item.confidence < 0.95));
  assert.ok(cleaned.suggestions.some((item) => item.suggested_match === "Niacinamide" && item.confidence < 0.95));
});

test("Botnoyl-like OCR remains unresolved with a warning suggestion", () => {
  const cleaned = cleanInciText("INCI: Botnoyl Tripeptide-1, Aqua");

  assert.ok(cleaned.ingredients.includes("Botnoyl Tripeptide-1"));
  assert.ok(cleaned.suggestions.some((item) => item.original === "Botnoyl Tripeptide-1"));
});

test("localized ingredient names are converted to canonical INCI", () => {
  const cleaned = cleanInciText("INCI: ÁGUA, ÁCIDO SALICÍLICO, BENZOATO DE SÓDIO, GOMA XANTANA, CAPRILILGLICOL");

  assert.deepEqual(cleaned.ingredients, [
    "Aqua",
    "Salicylic Acid",
    "Sodium Benzoate",
    "Xanthan Gum",
    "Caprylyl Glycol"
  ]);
  assert.ok(cleaned.autoCorrections.some((item) => item.source === "inci_translation" && item.language === "portuguese"));
});

test("analyzer exposes INCI cleaning metadata and does not analyze warnings as ingredients", () => {
  const result = analyzeComposition({ text: TRIXOSIL_OCR });

  assert.equal(result.unknown.some((item) => /Производитель|Barcode|Меры/.test(item.input)), false);
  assert.ok(result.inciCleaning.autoCorrections.length >= 3);
  assert.ok(result.inciCleaning.suggestions.some((item) => /Botnoyl/i.test(item.original)));
  assert.ok(result.found.some((item) => item.name === "PEG-40 Hydrogenated Castor Oil"));
});
