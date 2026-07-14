import assert from "node:assert/strict";
import test from "node:test";
import { analyzeComposition } from "../src/analyzer.js";

function classify(productName, text) {
  return analyzeComposition({ productName, text, profile: {} }).productSafety.type;
}

test("moisturizing creams are not classified as hair or acid products", () => {
  const ceraveCream = "Aqua, Glycerin, Cetearyl Alcohol, Caprylic/Capric Triglyceride, Cetyl Alcohol, Ceteareth-20, Petrolatum, Potassium Phosphate, Ceramide NP, Ceramide AP, Ceramide EOP, Carbomer, Dimethicone, Sodium Lauroyl Lactylate, Cholesterol, Disodium EDTA, Tocopherol, Hydroxyethylcellulose, Xanthan Gum, Phytosphingosine";
  const niveaSoft = "Water, Glycerin, Myristyl Alcohol, Mineral Oil, Butylene Glycol, Alcohol Denat., Petrolatum, Myristyl Myristate, Palmitic Acid, Glyceryl Stearate, Stearic Acid, Hydrogenated Coco-Glycerides, Dimethicone, Simmondsia Chinensis Seed Oil, Tocopheryl Acetate, Lanolin Alcohol, Myristic Acid, Arachidic Acid, Oleic Acid, Polyglyceryl-2 Caprate, Fragrance, Carbomer, Sodium Hydroxide, Phenoxyethanol";

  assert.equal(classify("CeraVe Moisturizing Cream", ceraveCream), "barrier_moisturizer");
  assert.equal(classify("NIVEA Soft Moisturizing Cream", niveaSoft), "barrier_moisturizer");
});

test("hydrating cleanser and micellar water are classified as cleansing products", () => {
  const ceraveCleanser = "Aqua/Water, Glycerin, Cetearyl Alcohol, Phenoxyethanol, Stearyl Alcohol, Cetyl Alcohol, PEG-40 Stearate, Behentrimonium Methosulfate, Ceramide NP, Ceramide AP, Ceramide EOP, Carbomer, Glyceryl Stearate, Sodium Lauroyl Lactylate, Cholesterol, Polysorbate 20, Disodium EDTA, Dipotassium Phosphate, Potassium Phosphate, Sodium Hyaluronate, Xanthan Gum, Phytosphingosine";
  const micellar = "Aqua/Water/Eau, Peg-6 Caprylic/Capric Glycerides, Fructooligosaccharides, Mannitol, Xylitol, Rhamnose, Cucumis Sativus Fruit Extract, Propylene Glycol, Cetrimonium Bromide, Disodium EDTA";

  assert.equal(classify("CeraVe Hydrating Facial Cleanser", ceraveCleanser), "cleanser");
  assert.equal(classify("Bioderma Sensibio H2O Micellar Water", micellar), "cleanser");
});

test("specific product classes remain distinct", () => {
  assert.equal(
    classify(
      "La Roche-Posay Anthelios UVMune 400 Invisible Fluid SPF50+",
      "Aqua, Alcohol Denat., Ethylhexyl Salicylate, Bis-Ethylhexyloxyphenol Methoxyphenyl Triazine, Ethylhexyl Triazone, Butyl Methoxydibenzoylmethane, Glycerin, Diethylamino Hydroxybenzoyl Hexyl Benzoate, Drometrizole Trisiloxane"
    ),
    "spf"
  );
  assert.equal(
    classify("Head & Shoulders Classic Clean Shampoo", "Pyrithione Zinc, Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Dimethicone, Sodium Benzoate"),
    "hair_scalp"
  );
  assert.equal(
    classify("EMLA Cream 5%", "Lidocaine, Prilocaine, Carbomer, Macrogolglycerol Hydroxystearate, Sodium Hydroxide, Purified Water"),
    "local_anesthetic"
  );
});
