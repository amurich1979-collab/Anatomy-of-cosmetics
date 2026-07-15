import test from "node:test";
import assert from "node:assert/strict";
import { extractInciDecoderUrls, parseInciDecoderProductPage } from "../src/services/productSources/inciDecoder.js";

test("INCI Decoder parser keeps an explicitly published INCI as an unverified formula", () => {
  const product = parseInciDecoderProductPage(`
    <h1>Example Retinal Serum</h1>
    <meta name="description" content="Example Retinal Serum ingredients explained: Aqua, Glycerin, Retinal, Panthenol, Phenoxyethanol">
  `, "https://incidecoder.com/products/example-retinal-serum");

  assert.equal(product.name, "Example Retinal Serum");
  assert.equal(product.composition, "Aqua, Glycerin, Retinal, Panthenol, Phenoxyethanol");
  assert.equal(product.source, "INCI Decoder");
  assert.equal(product.verified, false);
});

test("INCI Decoder discovery extracts only product-card links", () => {
  const urls = extractInciDecoderUrls(`
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fincidecoder.com%2Fproducts%2Fexample-serum&amp;rut=1">Product</a>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fincidecoder.com%2Fingredient%2Fretinal&amp;rut=1">Ingredient</a>
  `);

  assert.deepEqual(urls, ["https://incidecoder.com/products/example-serum"]);
});
