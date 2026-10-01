import test from "node:test";
import assert from "node:assert/strict";
import { findFormulaAlternativesDetailed } from "../src/analogs.js";

const SOURCE_INCI = "Aqua, Glycerin, Cetearyl Alcohol, Dimethicone, Panthenol, Niacinamide, Phenoxyethanol";
const sourceEvidence = {
  identificationStatus: "confirmed",
  name: "Daily Face Moisturizer Cream",
  category: "Face moisturizer cream",
  useInstructions: "Apply to face and leave on.",
  source: { name: "Brand", type: "official_brand_page", url: "https://brand.example/source" }
};

function product(overrides = {}) {
  return {
    id: "candidate-cream",
    name: "Daily Face Moisturizer Cream Plus",
    brand: "Example",
    category: "Face moisturizer cream",
    composition: "Aqua, Glycerin, Cetearyl Alcohol, Dimethicone, Niacinamide, Phenoxyethanol, Tocopherol",
    compositionScope: "full",
    hasComposition: true,
    useInstructions: "Apply to face and leave on.",
    source: "Official brand page",
    sourceType: "official_brand_page",
    sourceUrl: "https://brand.example/candidate",
    ...overrides
  };
}

function search(overrides = {}) {
  return findFormulaAlternativesDetailed({
    text: SOURCE_INCI,
    productName: "Original Daily Face Moisturizer",
    formulaScope: "full",
    productEvidence: sourceEvidence,
    sourceProduct: { id: "source", composition: SOURCE_INCI, compositionScope: "full" },
    products: [product()],
    ...overrides
  });
}

test("filters peel, shampoo, procedure product and demo before similarity ranking", () => {
  const result = search({ products: [
    product(),
    product({ id: "peel", name: "Acid Peel", category: "Acid peel", composition: "Aqua, Glycerin, Glycolic Acid, Lactic Acid, Phenoxyethanol", useInstructions: "Apply to face and rinse off." }),
    product({ id: "shampoo", name: "Moisturizing Shampoo", category: "Hair shampoo", composition: "Aqua, Glycerin, Sodium Laureth Sulfate, Panthenol, Phenoxyethanol", useInstructions: "Apply to hair and rinse off." }),
    product({ id: "procedure", name: "Numbing Cream", category: "Local anesthetic", composition: "Aqua, Glycerin, Prilocaine Hydrochloride, Cetearyl Alcohol, Phenoxyethanol" }),
    product({ id: "demo-cream", name: "Demo Cream", brand: "Demo", market: "MVP demo" })
  ] });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.alternatives.map((item) => item.id), ["candidate-cream"]);
  assert.ok(result.rejected.purpose_mismatch >= 2);
  assert.equal(result.rejected.demo_product, 1);
});

test("does not present an incomplete source or candidate formula as a replacement", () => {
  const incompleteSource = search({ formulaScope: "partial" });
  assert.equal(incompleteSource.status, "withheld");
  assert.equal(incompleteSource.reason, "source_formula_incomplete");
  assert.deepEqual(incompleteSource.alternatives, []);

  const incompleteCandidate = search({ products: [product({ compositionScope: "active_only" })] });
  assert.equal(incompleteCandidate.status, "empty");
  assert.equal(incompleteCandidate.rejected.candidate_formula_incomplete, 1);
});

test("checks personal restrictions before candidate ranking", () => {
  const result = search({
    profile: { allergens: ["Parfum"] },
    products: [
      product({ id: "fragranced", composition: `${product().composition}, Parfum` }),
      product({ id: "fragrance-free", name: "Fragrance Free Face Moisturizer" })
    ]
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.alternatives.map((item) => item.id), ["fragrance-free"]);
  assert.equal(result.rejected.personal_restriction, 1);
});

test("marks price and Russian availability unknown without dated source evidence", () => {
  const result = search({ products: [product({ market: "Russia", brand: "Rururu", price: 100 })] });
  const item = result.alternatives[0];
  assert.equal(item.priceComparison.status, "unknown");
  assert.equal(item.availabilityEvidence.status, "unknown");
  assert.match(item.price, /неизвестна/i);
  assert.match(item.ruAvailability, /неизвестно/i);
  assert.equal(item.replacementStatus, "candidate_not_equivalent");
  assert.equal(item.why.length, 3);
  assert.ok(item.differences.missingFromCandidate.length > 0);
  assert.ok(item.differences.addedByCandidate.length > 0);
  assert.match(item.note, /не идентичная/i);
});

test("calls a product cheaper only for comparable unit prices with date and source", () => {
  const sourcePrice = { amount: 1000, currency: "RUB", volume: { value: 50, unit: "ml" }, observedAt: "2026-09-20", source: { url: "https://shop.example/source" } };
  const candidatePrice = { amount: 700, currency: "RUB", volume: { value: 50, unit: "ml" }, observedAt: "2026-09-21", source: { url: "https://shop.example/candidate" } };
  const result = search({
    sourceProduct: { id: "source", composition: SOURCE_INCI, compositionScope: "full", priceEvidence: sourcePrice },
    products: [product({ priceEvidence: candidatePrice })]
  });
  assert.equal(result.alternatives[0].priceComparison.status, "cheaper");
  assert.equal(result.alternatives[0].priceComparison.deltaPercent, -30);
});
