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

const CERAVE_NOISY_OCR = `
Canh Бао. KhaJuoi on, tré em va tré 50 sinh tir 2 thang tuoi 2021500 ~3NG tryc tip, tranh ха tm vai tré ern ALCOHOL
\\CREDIENTS ayy, AQUA/WATER, GLYCERIN, CETEARYL CETEARETH RYLIC/CAPRIC TRIGLYCERIDE, CETYL ALCOHOL.
NP CERAMIDE PETROLATUM, POTASSIUM PHOSPHATE, CERAMIDE BEHENTRIMa + CERAMIDE EOP, CARBOMER.
DIMETHICONE, —— SODIUM RIMONIUN METHOSULFATE, SODIUM LAURQYL LACTYLATE, EDTA DIPQTASRONATE,
CHOLESTEROL, PHENOXYETHANOL, DISODIUM XANTHAN О, PHOSPHATE, TOCOPHEROL, PHYTOSPHINGOSINE.
M, ETHYLHEXYLGLYCERIN. [Code ЕЛ. 0213768/2) CeraVe LLC, New York, Ny 10001
Nam. Tang 23, 24 va 25, 109 The Nexus 50 3A-3B duo, Ben Nghe, quan 1,
Ho Chi Minh, Viet Nam.
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

test("cleanInciText handles noisy multilingual OCR and stops before address blocks", () => {
  const cleaned = cleanInciText(CERAVE_NOISY_OCR);

  assert.equal(/CeraVe LLC|New York|Ho Chi Minh|Viet Nam|The Nexus/i.test(cleaned.extractedBlock), false);
  assert.equal(cleaned.ingredients.some((item) => /CeraVe|New York|Nexus|Code|Canh|Tang/i.test(item)), false);
  assert.ok(cleaned.ingredients.includes("Aqua"));
  assert.ok(cleaned.ingredients.includes("Glycerin"));
  assert.ok(cleaned.ingredients.includes("Cetyl Alcohol"));
  assert.ok(cleaned.ingredients.includes("Ceramide NP"));
  assert.ok(cleaned.ingredients.includes("Petrolatum"));
  assert.ok(cleaned.ingredients.includes("Potassium Phosphate"));
  assert.ok(cleaned.ingredients.includes("Ceramide EOP"));
  assert.ok(cleaned.ingredients.includes("Carbomer"));
  assert.ok(cleaned.ingredients.includes("Dimethicone"));
  assert.ok(cleaned.ingredients.includes("Sodium Lauroyl Lactylate"));
  assert.ok(cleaned.ingredients.includes("Cholesterol"));
  assert.ok(cleaned.ingredients.includes("Phenoxyethanol"));
  assert.ok(cleaned.ingredients.includes("Disodium Phosphate"));
  assert.ok(cleaned.ingredients.includes("Xanthan Gum"));
  assert.ok(cleaned.ingredients.includes("Tocopherol"));
  assert.ok(cleaned.ingredients.includes("Phytosphingosine"));
  assert.ok(cleaned.ingredients.includes("Ethylhexylglycerin"));
  assert.ok(cleaned.confidence > 0.7);
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
