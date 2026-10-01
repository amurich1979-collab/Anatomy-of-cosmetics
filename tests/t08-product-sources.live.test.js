import test from "node:test";
import assert from "node:assert/strict";
import { searchExternalProductsDetailed } from "../src/services/productSources/index.js";

test("optional live product-source smoke test", {
  skip: process.env.LIVE_PRODUCT_SOURCES !== "1"
}, async () => {
  const result = await searchExternalProductsDetailed("3017620422003", { useCache: false });
  assert.ok(["found", "no_inci", "not_found", "unavailable"].includes(result.status));
  assert.ok(Array.isArray(result.sourceStatuses));
});
