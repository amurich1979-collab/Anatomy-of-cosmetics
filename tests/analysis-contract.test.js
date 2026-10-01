import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { analyzeComposition } from "../src/analyzer.js";
import {
  createAnalysisContract,
  inspectStoredAnalysisContract,
  normalizeFormulaScope,
  validateAnalysisContract
} from "../src/analysisContract.js";
import { app } from "../src/server.js";

function request(overrides = {}) {
  return {
    text: "Aqua, Glycerin, Niacinamide",
    productName: "Test formula",
    profile: { skinType: "dry", concerns: "barrier" },
    evidence: {},
    ...overrides
  };
}

function contractFor(requestValue) {
  const analysis = analyzeComposition(requestValue);
  return createAnalysisContract({
    analysis,
    request: requestValue,
    generatedAt: "2026-09-27T10:00:00.000Z"
  });
}

test("T04: explicit unresolved status survives adaptation even with an exact candidate", () => {
  for (const status of ["suggested", "unknown"]) {
    const contract = createAnalysisContract({
      analysis: { found: [{ input: "uncertain", name: "Aqua", status, match_type: "exact" }] },
      request: request()
    });
    assert.equal(contract.ingredients[0].status, status);
    assert.equal(contract.ingredients[0].canonicalName, null);
    assert.equal(contract.metrics.knowledgeCoverage.confirmed, 0);
  }
});

test("T04: invalid metric types remain unmeasured and invalid saved metrics are rejected", () => {
  for (const value of [false, true, "", " ", "0.9", null]) {
    const contract = contractFor(request({ evidence: { metrics: { ocrReadability: { value } } } }));
    assert.equal(contract.metrics.ocrReadability.value, null);
    assert.equal(contract.metrics.ocrReadability.status, "not_measured");
    contract.metrics.ocrReadability.status = "measured";
    assert.equal(inspectStoredAnalysisContract({ analysisContract: contract }).status, "invalid");
  }
  const zero = contractFor(request({ evidence: { metrics: { ocrReadability: { value: 0 } } } }));
  assert.equal(zero.metrics.ocrReadability.value, 0);
  assert.equal(zero.metrics.ocrReadability.status, "measured");
});

test("T04: photo formula does not inherit source metadata from a suggested product", () => {
  const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf("function setCompositionValue(");
  const end = source.indexOf("function cancelPendingProductWork(", start);
  assert.ok(start > 0 && end > start);
  const context = vm.createContext({});
  vm.runInContext(`
    let compositionOrigin;
    const photoJob = null;
    const composition = {};
    const productName = { value: '' };
    const selectedProductCard = { id: 'candidate', sourceUrl: 'https://example.test/product', importedAt: '2026-09-27' };
    ${source.slice(start, end)}
    setCompositionValue('Aqua, Glycerin', { mode: 'photo', product: selectedProductCard, source: 'photo_ocr', sourceType: 'photo_ocr' });
    globalThis.evidence = buildAnalysisEvidence();
  `, context);
  assert.equal(context.evidence.formula.source.url, null);
  assert.equal(context.evidence.formula.source.retrievedAt, null);
  assert.equal(context.evidence.formula.scope, "unknown");
  assert.equal(context.evidence.product.identificationStatus, "suggested");
});

async function postAnalyze(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("T04: full and active-only formula scopes survive the complete HTTP server path", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const full = await postAnalyze(baseUrl, request({
    evidence: {
      product: {
        id: "product-1",
        barcode: "4600000000001",
        brand: "Test Brand",
        name: "Test Formula",
        identificationStatus: "confirmed",
        source: {
          name: "Product catalogue",
          type: "catalogue",
          retrievedAt: "2026-09-27T08:00:00.000Z"
        }
      },
      formula: {
        scope: "full",
        version: "EU-2026",
        source: {
          name: "Label",
          type: "package_label",
          retrievedAt: "2026-09-27T09:00:00.000Z"
        }
      }
    }
  }));
  const activeOnly = await postAnalyze(baseUrl, request({
    evidence: {
      formula: {
        scope: "active_ingredients_only",
        source: { name: "Official product page", type: "manufacturer" }
      }
    }
  }));

  assert.equal(full.analysisContract.formula.scope, "full");
  assert.equal(full.analysisContract.formula.version, "EU-2026");
  assert.equal(full.analysisContract.formula.source.name, "Label");
  assert.equal(full.analysisContract.formula.source.retrievedAt, "2026-09-27T09:00:00.000Z");
  assert.equal(full.analysisContract.formula.rawText, "Aqua, Glycerin, Niacinamide");
  assert.equal(full.analysisContract.product.identity.barcode, "4600000000001");
  assert.equal(full.analysisContract.product.identificationStatus, "confirmed");
  assert.equal(full.analysisContract.algorithmVersion, "analyzer-v5-personal-context");
  assert.equal(full.analysisContract.evidenceVersions.rules, "1.1.0");
  assert.deepEqual(full.analysisContract.evidenceVersions, full.evidenceVersions);
  assert.equal(activeOnly.analysisContract.formula.scope, "active_only");
  assert.notEqual(full.analysisContract.formula.scope, activeOnly.analysisContract.formula.scope);
  assert.deepEqual(full.analysisContract.profile, {
    skinType: "сухая", concerns: "barrier", context: "", goals: [], applicationArea: "",
    allergyStatus: "", allergens: [], previousReaction: ""
  });
  assert.deepEqual(full.analysisContract.profile, full.personalization.profile);
});

test("T04: ambiguous Hamamelis match remains suggested and cannot validate as confirmed", () => {
  const requestValue = request({ text: "Hamamelis Virginiana Extract" });
  const contract = contractFor(requestValue);
  const ingredient = contract.ingredients[0];

  assert.equal(ingredient.status, "suggested");
  assert.equal(ingredient.canonicalName, null);
  assert.equal(ingredient.match.method, "suggested");
  assert.equal(ingredient.match.suggestedName, "Hamamelis Virginiana Bark/Leaf Extract");

  const invalid = structuredClone(contract);
  invalid.ingredients[0].status = "confirmed";
  assert.equal(validateAnalysisContract(invalid).valid, false);
  assert.match(validateAnalysisContract(invalid).errors.join(" "), /cannot confirm an ambiguous match/);
});

test("T04: missing evidence remains unknown/null and generic confidence is not OCR readability", () => {
  const requestValue = request({
    evidence: {
      confidence: 0.99,
      metrics: { ocrReadability: { value: null } }
    }
  });
  const contract = contractFor(requestValue);

  assert.equal(contract.formula.scope, "unknown");
  assert.equal(contract.formula.version, null);
  assert.equal(contract.formula.source.name, null);
  assert.equal(contract.product.identificationStatus, "unknown");
  assert.equal(contract.metrics.ocrReadability.value, null);
  assert.equal(contract.metrics.ocrReadability.status, "not_measured");
  assert.equal(contract.metrics.productIdentification.value, null);
  assert.equal(contract.metrics.knowledgeCoverage.status, "measured");
});

test("T04: unknown source scope aliases are not promoted to full", () => {
  assert.equal(normalizeFormulaScope(), "unknown");
  assert.equal(normalizeFormulaScope("not_published"), "unknown");
  assert.equal(normalizeFormulaScope("unverified_external_inci"), "unknown");
  assert.equal(normalizeFormulaScope("active_ingredients_only"), "active_only");
  assert.equal(normalizeFormulaScope("partial"), "partial");
});

test("T04: legacy saved analysis stays legacy instead of being reinterpreted", () => {
  const legacy = inspectStoredAnalysisContract({
    payload: {
      composition: "Aqua, Glycerin",
      analysis: { totalIngredients: 2, score: { score: 90 } }
    }
  });

  assert.equal(legacy.status, "legacy");
  assert.equal(legacy.contract, null);
  assert.equal(legacy.reason, "missing_analysis_contract");
});

test("T04: measured indicators are independent and use explicit methods", () => {
  const requestValue = request({
    evidence: {
      product: { identificationStatus: "suggested" },
      metrics: {
        ocrReadability: { value: 0.7, method: "character-legibility-v1" },
        productIdentification: { value: 0.6, method: "barcode-name-agreement-v1" }
      }
    }
  });
  const contract = contractFor(requestValue);

  assert.deepEqual(contract.metrics.ocrReadability, {
    value: 0.7,
    status: "measured",
    method: "character-legibility-v1"
  });
  assert.deepEqual(contract.metrics.productIdentification, {
    value: 0.6,
    status: "measured",
    method: "barcode-name-agreement-v1"
  });
  assert.equal(contract.product.identificationStatus, "suggested");
});
