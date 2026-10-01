import test from "node:test";
import assert from "node:assert/strict";
import {
  clearProductSourceCache,
  mergeSourceProducts,
  rankSourceProducts,
  searchExternalProductsDetailed
} from "../src/services/productSources/index.js";
import { openBeautyFactsSource } from "../src/services/productSources/openBeautyFacts.js";
import { externalCatalogDiscoverySource } from "../src/services/productSources/externalCatalogDiscovery.js";

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

test("T08 keeps an exact EAN card when INCI is unavailable", async () => {
  const code = "5901234123457";
  const source = adapter("metadata", {
    searchByBarcode: async () => [{
      id: `metadata-${code}`,
      code,
      name: "Calm Cream",
      brand: "Fixture",
      composition: "",
      source: "Metadata fixture",
      sourceType: "metadata"
    }]
  });

  const result = await searchExternalProductsDetailed(code, { sources: [source], useCache: false });

  assert.equal(result.status, "no_inci");
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].code, code);
  assert.equal(result.products[0].hasComposition, false);
  assert.equal(result.sourceStatuses[0].status, "no_inci");
});

test("T08 does not rank an unrelated card only because it has INCI", () => {
  const ranked = rankSourceProducts([{
    code: "4601234567893",
    name: "Repair Shampoo",
    brand: "Other Brand",
    composition: "Aqua, Sodium Laureth Sulfate, Parfum"
  }], "Fixture Calm Cream");

  assert.deepEqual(ranked, []);
});

test("T08 enriches an identified barcode only from a compatible product model", async () => {
  const code = "5901234123457";
  const metadata = adapter("metadata", {
    searchByBarcode: async () => [{
      id: `metadata-${code}`,
      code,
      name: "Calm Barrier Cream 50 ml",
      brand: "Fixture Lab",
      composition: "",
      source: "Metadata fixture",
      sourceType: "metadata"
    }]
  });
  const formulas = adapter("formula", {
    isFallback: true,
    searchByName: async () => [
      {
        id: "formula-wrong-variant",
        name: "Calm Barrier Cream 100 ml",
        brand: "Fixture Lab",
        composition: "Aqua, Parfum",
        source: "Formula fixture",
        sourceType: "formula"
      },
      {
        id: "formula-unrelated",
        name: "Repair Shampoo 50 ml",
        brand: "Other Brand",
        composition: "Aqua, Sodium Laureth Sulfate",
        source: "Formula fixture",
        sourceType: "formula"
      },
      {
        id: "formula-match",
        name: "Calm Barrier Cream 50 ml",
        brand: "Fixture Lab",
        composition: "Aqua, Glycerin, Ceramide NP",
        source: "Formula fixture",
        sourceType: "formula",
        sourceUrl: "https://fixture.invalid/calm-cream-50"
      }
    ]
  });

  const result = await searchExternalProductsDetailed(code, {
    sources: [metadata, formulas],
    useCache: false
  });

  assert.equal(result.status, "found");
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].formulaVariants.length, 1);
  assert.equal(result.products[0].formulaVariants[0].composition, "Aqua, Glycerin, Ceramide NP");
});

test("T08 preserves conflicting formula versions with source metadata", () => {
  const merged = mergeSourceProducts([
    {
      id: "source-a-123",
      code: "1234567890123",
      name: "Daily Cream",
      brand: "Fixture",
      composition: "Aqua, Glycerin",
      source: "Source A",
      sourceType: "source_a",
      sourceUrl: "https://a.invalid/product",
      updatedAt: "2025-01-10T00:00:00.000Z",
      importedAt: "2026-09-28T00:00:00.000Z",
      market: "EU",
      variant: "50 ml"
    },
    {
      id: "source-b-123",
      code: "1234567890123",
      name: "Daily Cream",
      brand: "Fixture",
      composition: "Aqua, Glycerin, Niacinamide",
      source: "Source B",
      sourceType: "source_b",
      sourceUrl: "https://b.invalid/product",
      updatedAt: "2026-02-15T00:00:00.000Z",
      importedAt: "2026-09-28T00:00:00.000Z",
      market: "RU",
      variant: "50 ml new formula"
    }
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].hasFormulaConflict, true);
  assert.equal(merged[0].formulaVariants.length, 2);
  assert.equal(merged[0].formulaVariants[0].fetchedAt, "2026-09-28T00:00:00.000Z");
  assert.deepEqual(
    merged[0].formulaVariants.map(({ source, market, variant, updatedAt }) => ({ source, market, variant, updatedAt })),
    [
      { source: "Source A", market: "EU", variant: "50 ml", updatedAt: "2025-01-10T00:00:00.000Z" },
      { source: "Source B", market: "RU", variant: "50 ml new formula", updatedAt: "2026-02-15T00:00:00.000Z" }
    ]
  );
});

test("T08 distinguishes not_found from unavailable", async () => {
  const missing = adapter("missing");
  const offline = adapter("offline", {
    searchByBarcode: async () => {
      throw new Error("fixture timeout");
    }
  });

  const notFound = await searchExternalProductsDetailed("5901234123457", {
    sources: [missing],
    useCache: false
  });
  const unavailable = await searchExternalProductsDetailed("5901234123457", {
    sources: [offline],
    useCache: false
  });

  assert.equal(notFound.status, "not_found");
  assert.equal(notFound.sourceStatuses[0].status, "not_found");
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.sourceStatuses[0].status, "unavailable");
});

test("T08 applies a short negative cache and expires it deterministically", async () => {
  clearProductSourceCache();
  let calls = 0;
  const missing = adapter("cached-missing", {
    searchByName: async () => {
      calls += 1;
      return [];
    }
  });

  const first = await searchExternalProductsDetailed("Missing fixture", {
    sources: [missing],
    now: 1_000
  });
  const cached = await searchExternalProductsDetailed("Missing fixture", {
    sources: [missing],
    now: 2_000
  });
  const expired = await searchExternalProductsDetailed("Missing fixture", {
    sources: [missing],
    now: 1_000 + 5 * 60_000 + 1
  });

  assert.equal(first.status, "not_found");
  assert.equal(cached.cache.hit, true);
  assert.equal(expired.cache.hit, false);
  assert.equal(calls, 2);
});

test("T08 maps a real adapter response without INCI to no_inci", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    product: {
      code: "5901234123457",
      product_name: "Calm Cream",
      brands: "Fixture Lab",
      countries: "France, Russia",
      quantity: "50 ml",
      last_modified_t: 1_735_689_600
    }
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  try {
    const result = await searchExternalProductsDetailed("5901234123457", {
      sources: [openBeautyFactsSource],
      useCache: false
    });
    assert.equal(result.status, "no_inci");
    assert.equal(result.products[0].market, "France, Russia");
    assert.equal(result.products[0].variant, "50 ml");
    assert.equal(result.products[0].updatedAt, "2025-01-01T00:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("T08 does not fetch a user-forged external catalog URL", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("must not fetch");
  };
  const forgedUrl = "https://example.invalid/private-product";
  const forgedId = `external-catalog-${Buffer.from(forgedUrl).toString("base64url")}`;

  try {
    assert.equal(await externalCatalogDiscoverySource.getProduct(forgedId), null);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
