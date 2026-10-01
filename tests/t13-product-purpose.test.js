import assert from "node:assert/strict";
import test from "node:test";
import { analyzeComposition } from "../src/analyzer.js";
import { app } from "../src/server.js";

const analyze = (productName, text, productEvidence) => analyzeComposition({
  productName,
  text,
  formulaScope: "full",
  productEvidence
});

test("T13: a face cleanser with one lactic acid is not promoted to a peel", () => {
  const result = analyze(
    "Face cleanser",
    "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Lactic Acid, Glycerin"
  );
  assert.equal(result.productSafety.type, "cleanser");
  assert.equal(result.productSafety.purposeStatus, "hypothesis");
  assert.equal(result.productSafety.applicationEvidence.status, "unavailable");
  assert.match(result.productSafety.intendedUse, /Гипотеза/i);
});

test("T13: a single titanium dioxide does not turn decorative makeup into SPF", () => {
  const result = analyze(
    "Decorative foundation",
    "Aqua, Dimethicone, Titanium Dioxide, Iron Oxides, Glycerin"
  );
  assert.notEqual(result.productSafety.type, "spf");
  assert.equal(result.productSafety.type, "decorative_cosmetic");
  assert.doesNotMatch(result.formulaType, /SPF|фотозащит/i);
});

test("T13: fatty acids in a cream never create a peel instruction", () => {
  const result = analyze(
    "Barrier cream",
    "Aqua, Glycerin, Palmitic Acid, Stearic Acid, Cetearyl Alcohol, Petrolatum"
  );
  assert.equal(result.productSafety.type, "barrier_moisturizer");
  assert.notEqual(result.productSafety.exposure?.mode, "peel_course");
  assert.doesNotMatch(result.productSafety.application, /кислот|пилинг|эксфоли|курс/i);
});

test("T13: post-peel recovery wording is not itself a peel claim", () => {
  const result = analyze(
    "AHA Post-Peel Recovery Serum",
    "Aqua, Glycerin, Panthenol, Niacinamide, Sodium Hyaluronate, Allantoin"
  );
  assert.notEqual(result.productSafety.type, "acid_peel");
  assert.equal(result.productSafety.type, "active_serum");
  assert.equal(result.productSafety.purposeStatus, "hypothesis");
});

test("T13: official manufacturer purpose and instruction retain their source", () => {
  const sourceUrl = "https://brand.example/products/multi-peeling";
  const result = analyze("Multi Peeling", "Aqua, Glycolic Acid, Lactic Acid, Xanthan Gum", {
    identificationStatus: "confirmed",
    name: "Multi Peeling",
    category: "Пилинг для лица",
    description: "Профессиональное кислотное средство для кожи лица.",
    useInstructions: "Смыть по инструкции производителя.",
    source: { name: "Официальный каталог бренда", type: "official_brand_page", url: sourceUrl }
  });
  assert.equal(result.productSafety.type, "acid_peel");
  assert.equal(result.productSafety.purposeStatus, "confirmed_manufacturer");
  assert.equal(result.productSafety.purposeEvidence.source.url, sourceUrl);
  assert.equal(result.productSafety.application, "Смыть по инструкции производителя.");
  assert.equal(result.productSafety.applicationEvidence.status, "confirmed_manufacturer");
  assert.equal(result.productSafety.applicationEvidence.source.url, sourceUrl);
});

test("T13: a third-party product card is source-backed, not manufacturer-confirmed", () => {
  const sourceUrl = "https://world.openbeautyfacts.org/product/example";
  const result = analyze("Gentle Face Cleanser", "Aqua, Decyl Glucoside, Glycerin", {
    identificationStatus: "confirmed",
    name: "Gentle Face Cleanser",
    category: "Facial cleanser",
    useInstructions: "Massage and rinse with water.",
    source: { name: "Open Beauty Facts", type: "open_beauty_facts", url: sourceUrl }
  });
  assert.equal(result.productSafety.type, "cleanser");
  assert.equal(result.productSafety.purposeStatus, "source_backed");
  assert.equal(result.productSafety.purposeEvidence.source.url, sourceUrl);
  assert.doesNotMatch(result.productSafety.intendedUse, /подтверждено карточкой производителя/i);
});

test("T13: a suggested photo match does not become manufacturer-confirmed", () => {
  const result = analyze("Official Daily Cream", "Aqua, Glycerin, Cetearyl Alcohol, Petrolatum", {
    identificationStatus: "suggested",
    name: "Official Daily Cream",
    category: "Moisturizing cream",
    useInstructions: "Apply twice daily.",
    source: { name: "Official brand catalogue", type: "official_brand_page", url: "https://brand.example/cream" }
  });
  assert.equal(result.productSafety.type, "barrier_moisturizer");
  assert.equal(result.productSafety.purposeStatus, "hypothesis");
  assert.equal(result.productSafety.applicationEvidence.status, "unavailable");
  assert.doesNotMatch(result.productSafety.application, /twice daily/i);
});

test("T13: conflicting source and formula return uncertainty instead of fixed priority", () => {
  const result = analyze("Sun Protection Shampoo SPF", "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Guar Hydroxypropyltrimonium Chloride", {
    identificationStatus: "confirmed",
    name: "Sun Protection Shampoo SPF",
    category: "Солнцезащитный крем SPF 30",
    description: "Несмываемая защита кожи от солнца.",
    source: { name: "Карточка каталога", type: "open_beauty_facts", url: "https://world.openbeautyfacts.org/product/test" }
  });
  assert.equal(result.productSafety.type, "unknown_cosmetic");
  assert.equal(result.productSafety.purposeStatus, "uncertain");
  assert.ok(result.productSafety.conflicts.length);
  assert.match(result.productSafety.requiredVerification, /этикет|карточ|назнач/i);
});

test("T13: marked examples distinguish cream, cleanser, shampoo, SPF, peel and anesthetic", () => {
  const cases = [
    ["Daily Moisturizing Cream", "Aqua, Glycerin, Cetearyl Alcohol, Petrolatum", "barrier_moisturizer"],
    ["Gentle Face Cleanser", "Aqua, Decyl Glucoside, Glycerin", "cleanser"],
    ["Daily Shampoo", "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine", "hair_scalp"],
    ["Face Sunscreen SPF 50", "Aqua, Ethylhexyl Triazone, Bis-Ethylhexyloxyphenol Methoxyphenyl Triazine", "spf"],
    ["Glycolic Peel", "Aqua, Glycolic Acid, Lactic Acid", "acid_peel"],
    ["Numbing cream", "Aqua, Lidocaine, Prilocaine, Carbomer", "local_anesthetic"]
  ];
  for (const [name, formula, expected] of cases) {
    assert.equal(analyze(name, formula).productSafety.type, expected, name);
  }
});

test("T13: an anesthetic never receives a generated drug regimen", () => {
  const result = analyze("Numbing cream", "Aqua, Lidocaine, Prilocaine, Carbomer");
  assert.equal(result.productSafety.shouldScoreAsCosmetic, false);
  assert.equal(result.productSafety.applicationEvidence.status, "unavailable");
  assert.match(result.productSafety.application, /инструкц/i);
  assert.doesNotMatch(result.productSafety.application, /\b(?:раз|минут|час|мг|мл)\b/i);
  assert.deepEqual(result.routineAdvice, []);
});

test("T13: formula-only mineral pigment and a single acid may remain unknown", () => {
  const pigment = analyze("", "Aqua, Titanium Dioxide, Iron Oxides");
  const acid = analyze("", "Aqua, Lactic Acid, Glycerin");
  assert.equal(pigment.productSafety.type, "unknown_cosmetic");
  assert.equal(acid.productSafety.type, "unknown_cosmetic");
  assert.equal(pigment.productSafety.purposeStatus, "uncertain");
  assert.equal(acid.productSafety.purposeStatus, "uncertain");
});

test("T13: the existing analyze route preserves product-purpose provenance", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Aqua, Decyl Glucoside, Glycerin",
      productName: "Official Gentle Cleanser",
      evidence: {
        product: {
          identificationStatus: "confirmed",
          name: "Official Gentle Cleanser",
          category: "Facial cleanser",
          useInstructions: "Massage and rinse with water.",
          source: {
            name: "Official brand catalogue",
            type: "official_brand_page",
            url: "https://brand.example/cleanser"
          }
        },
        formula: { scope: "full" }
      }
    })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.productSafety.type, "cleanser");
  assert.equal(result.productSafety.purposeStatus, "confirmed_manufacturer");
  assert.equal(result.productSafety.purposeEvidence.source.url, "https://brand.example/cleanser");
  assert.equal(result.productSafety.applicationEvidence.status, "confirmed_manufacturer");
  assert.equal(result.productSafety.exposure.mode, "rinse_off");
  assert.equal(result.analysisContract.product.purpose.status, "confirmed_manufacturer");
  assert.equal(result.analysisContract.product.purpose.source.url, "https://brand.example/cleanser");
  assert.equal(result.analysisContract.product.purpose.instruction.status, "confirmed_manufacturer");
});
