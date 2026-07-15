import test from "node:test";
import assert from "node:assert/strict";
import { extractExternalSearchUrls, parseExternalProductPage } from "../src/services/productSources/externalCatalogDiscovery.js";

test("external discovery accepts only structured product cards and preserves source verification", () => {
  const product = parseExternalProductPage(`
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Example Barrier Cream","brand":{"@type":"Brand","name":"Example"},"sku":"123","image":"https://shop.example/image.jpg","description":"Barrier cream","ingredients":"Aqua, Glycerin, Niacinamide, Panthenol"}
    </script>
  `, "https://shop.example/products/barrier-cream");

  assert.equal(product.name, "Example Barrier Cream");
  assert.equal(product.composition, "Aqua, Glycerin, Niacinamide, Panthenol");
  assert.equal(product.compositionScope, "unverified_external_inci");
  assert.equal(product.verified, false);
  assert.match(product.source, /shop\.example/);
});

test("external discovery decodes search redirects and skips search-engine links", () => {
  const urls = extractExternalSearchUrls(`
    <div class="result"><a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fshop.example%2Fproduct%2Fone">One</a></div>
    <div class="result"><a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fshop.example%2Fproduct%2Fone">Duplicate</a></div>
    <div class="result"><a class="result__a" href="https://www.google.com/search">Search</a></div>
  `);

  assert.deepEqual(urls, ["https://shop.example/product/one"]);
});
