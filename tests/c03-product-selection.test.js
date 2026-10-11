import assert from "node:assert/strict";
import test from "node:test";
import { createAnalysisContract } from "../src/analysisContract.js";
import { searchLocalProducts } from "../src/products.js";
import { mergeSourceProducts, rankSourceProducts, searchExternalProductsDetailed } from "../src/services/productSources/index.js";
import { buildAnalysisHistoryEntry, buildReanalysisRequest } from "../public/history-snapshot.js";
import {
  confirmFullLabelFormula,
  createFormulaOrigin,
  detachFormulaFromProduct,
  formulaAssociationStatus,
  isAsyncRevisionCurrent
} from "../public/formula-provenance.js";

function adapter(id, handlers = {}) {
  return {
    id,
    label: id,
    requiresApiKey: false,
    isFallback: Boolean(handlers.isFallback),
    searchByBarcode: handlers.searchByBarcode || (async () => []),
    searchByName: handlers.searchByName || (async () => []),
    getProduct: handlers.getProduct || (async () => null)
  };
}

test("C03: exact The Ordinary brand and product words outrank unrelated active-only cards", () => {
  const query = "The Ordinary Niacinamide 10 Zinc 1";
  const ranked = rankSourceProducts([
    {
      id: "wrong-gigi",
      brand: "GIGI",
      name: "27110 Acnon Day Control Moisturizer 50 ml",
      composition: "Niacinamide, Zinc PCA",
      compositionScope: "active_ingredients_only",
      sourceType: "gigi_official"
    },
    {
      id: "right-ordinary",
      brand: "The Ordinary",
      name: "Niacinamide 10% + Zinc 1%",
      composition: "Aqua, Niacinamide, Pentylene Glycol, Zinc PCA",
      compositionScope: "unknown",
      sourceType: "open_beauty_facts"
    }
  ], query);

  assert.equal(ranked[0]?.id, "right-ordinary");
  assert.equal(ranked.some((item) => item.id === "wrong-gigi"), false);
});

test("C03: unavailable The Ordinary product is not replaced by another product or brand", () => {
  const result = searchLocalProducts("The Ordinary Niacinamide 10 Zinc 1", 8);
  assert.deepEqual(result, []);
});

test("C03: barcode search keeps only the single exact identity", async () => {
  const code = "5901234123457";
  const source = adapter("barcode-fixture", {
    searchByBarcode: async () => [
      { id: "exact", code, brand: "Exact", name: "Calm Cream", composition: "Aqua, Glycerin" },
      { id: "wrong", code: "5901234123464", brand: "Wrong", name: "Other Cream", composition: "Aqua, Parfum" }
    ],
    searchByName: async () => []
  });
  const result = await searchExternalProductsDetailed(code, { sources: [source], useCache: false });
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].id, "exact");
});

test("C03: an exact barcode resolves a single cached catalogue card", () => {
  const result = searchLocalProducts("0769915190670", 8);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "obf-0769915190670");
  assert.equal(result[0].code, "0769915190670");
});

test("C03: conflicting formula variants retain scope and are never concatenated", () => {
  const merged = mergeSourceProducts([
    {
      id: "a",
      code: "1234567890123",
      brand: "Fixture",
      name: "Cream",
      composition: "Aqua, Glycerin",
      compositionScope: "full",
      source: "Label A",
      sourceType: "label_photo"
    },
    {
      id: "b",
      code: "1234567890123",
      brand: "Fixture",
      name: "Cream",
      composition: "Niacinamide, Zinc PCA",
      compositionScope: "active_ingredients_only",
      source: "Brand active list",
      sourceType: "official_brand_page"
    }
  ]);

  assert.equal(merged[0].hasFormulaConflict, true);
  assert.deepEqual(merged[0].formulaVariants.map((item) => item.compositionScope), ["full", "active_ingredients_only"]);
  assert.deepEqual(merged[0].formulaVariants.map((item) => item.composition), ["Aqua, Glycerin", "Niacinamide, Zinc PCA"]);
});

test("C03: user-confirmed full label remains user-confirmed in contract and history", () => {
  const request = {
    text: "Aqua, Glycerin",
    productName: "Fixture Cream",
    evidence: {
      product: {
        id: "fixture-cream",
        brand: "Fixture",
        name: "Cream",
        identificationStatus: "confirmed",
        source: { name: "Product card", type: "catalog" }
      },
      formula: {
        productId: "fixture-cream",
        scope: "full",
        confirmation: "user_confirmed",
        associationStatus: "confirmed",
        source: { name: "Этикетка пользователя", type: "user_label" }
      }
    }
  };
  const analysis = {
    found: [],
    unknown: [],
    assessment: { status: "not_assessed", reason: "unvalidated_scoring_method" },
    historyPolicy: { mode: "standard" }
  };
  const contract = createAnalysisContract({ analysis, request, generatedAt: "2026-10-03T10:00:00.000Z" });
  const response = { ...analysis, analysisContract: contract };
  const history = buildAnalysisHistoryEntry(request, response, "Этикетка пользователя");
  const reanalysis = buildReanalysisRequest(history);

  assert.equal(contract.formula.confirmation, "user_confirmed");
  assert.equal(contract.formula.associationStatus, "confirmed");
  assert.equal(contract.formula.productId, "fixture-cream");
  assert.notEqual(contract.formula.confirmation, "manufacturer_verified");
  assert.equal(history.payload.snapshot.formula.confirmation, "user_confirmed");
  assert.equal(reanalysis.evidence.formula.confirmation, "user_confirmed");
});

test("C03: switching product detaches a user-confirmed independent formula", () => {
  const original = confirmFullLabelFormula(createFormulaOrigin("Aqua, Glycerin", {
    mode: "manual",
    productId: "product-a",
    source: "manual"
  }), "product-a");
  assert.equal(formulaAssociationStatus(original, { id: "product-a" }), "confirmed");
  assert.equal(formulaAssociationStatus(original, { id: "product-b" }), "unconfirmed");

  const detached = detachFormulaFromProduct(original);
  assert.equal(detached.productId, "");
  assert.equal(detached.formulaScope, "unknown");
  assert.equal(detached.formulaConfirmation, "unverified");
});

test("C03: a late async response is invalid after input revision changes", () => {
  assert.equal(isAsyncRevisionCurrent(4, 4), true);
  assert.equal(isAsyncRevisionCurrent(4, 5), false);
});
