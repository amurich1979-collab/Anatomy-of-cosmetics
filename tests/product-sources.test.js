import test from "node:test";
import assert from "node:assert/strict";
import { mergeSourceProducts, productSources } from "../src/services/productSources/index.js";

test("product sources expose the common adapter interface", () => {
  assert.ok(productSources.length >= 3);
  productSources.forEach((source) => {
    assert.equal(typeof source.searchByBarcode, "function");
    assert.equal(typeof source.searchByName, "function");
    assert.equal(typeof source.getProduct, "function");
  });
});

test("different source formulas are kept as variants and not mixed", () => {
  const merged = mergeSourceProducts([
    {
      id: "obf-1234567890123",
      code: "1234567890123",
      name: "Test Cream",
      brand: "Brand",
      composition: "Aqua, Glycerin",
      source: "Open Beauty Facts",
      sourceType: "open_beauty_facts",
      sourceUrl: "https://world.openbeautyfacts.org/product/1234567890123",
      importedAt: "2026-07-12T00:00:00.000Z"
    },
    {
      id: "opf-1234567890123",
      code: "1234567890123",
      name: "Test Cream",
      brand: "Brand",
      composition: "Aqua, Glycerin, Niacinamide",
      source: "Open Products Facts",
      sourceType: "open_products_facts",
      sourceUrl: "https://world.openproductsfacts.org/product/1234567890123",
      importedAt: "2026-07-12T00:00:00.000Z"
    }
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].hasFormulaConflict, true);
  assert.equal(merged[0].formulaVariants.length, 2);
  assert.equal(merged[0].composition, "Aqua, Glycerin");
});
