import test from "node:test";
import assert from "node:assert/strict";
import { extractGigiProductUrls, parseGigiProductPage } from "../src/services/productSources/gigiOfficial.js";

const productUrl = "https://www.gigi.ru/product/27110_an_day_control_moisturizer_krem_dnevnoy_aknekontrol_50ml/";

const productHtml = `
  <script type="application/ld+json">
    {"@context":"https://schema.org/","@type":"Product","name":"27110 Дневной крем акне контроль GIGI Acnon Day Control Moisturizer, 50 мл","sku":"27110","image":"https://www.gigi.ru/image.jpg","description":"Легкий увлажняющий дневной крем для кожи, склонной к акне.","brand":{"@type":"Brand","name":"GIGI"}}
  </script>
  <div class="line"><span class="title" style="font-weight: bold;">Активные ингредиенты:</span><span>салициловая кислота, аллантоин, ниацинамид.</span></div>
  <div class="line"><span class="title" style="font-weight: bold;">Способ применения:</span><span>нанести на лицо до полного впитывания.</span></div>
`;

test("GIGI official product parser keeps active ingredients separate from INCI", () => {
  const product = parseGigiProductPage(productHtml, productUrl);

  assert.equal(product.id, "gigi-official-27110_an_day_control_moisturizer_krem_dnevnoy_aknekontrol_50ml");
  assert.equal(product.brand, "GIGI");
  assert.equal(product.code, "27110");
  assert.equal(product.composition, "");
  assert.equal(product.hasComposition, false);
  assert.equal(product.compositionScope, "active_ingredients_only");
  assert.match(product.activeIngredients, /салициловая кислота/i);
  assert.match(product.description, /увлажняющий дневной крем/i);
});

test("GIGI catalogue search extracts unique official product URLs", () => {
  const urls = extractGigiProductUrls(`
    <a href="/product/27110_an_day_control_moisturizer_krem_dnevnoy_aknekontrol_50ml/">One</a>
    <a href="/product/27110_an_day_control_moisturizer_krem_dnevnoy_aknekontrol_50ml/">Duplicate</a>
    <a href="/product/27116_an_multi_peeling_gel_multipiling_120ml/">Two</a>
  `);

  assert.deepEqual(urls, [
    productUrl,
    "https://www.gigi.ru/product/27116_an_multi_peeling_gel_multipiling_120ml/"
  ]);
});
