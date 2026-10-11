import assert from "node:assert/strict";
import test from "node:test";
import { analyzeComposition } from "../src/analyzer.js";
import { createAnalysisContract } from "../src/analysisContract.js";
import { validateFormulaAssessment } from "../src/services/formulaSystems.js";
import { applyQuantitativeEvidence, QUANTITATIVE_EVIDENCE_VERSION } from "../src/services/quantitativeEvidence.js";
import { buildAnalysisHistoryEntry, inspectAnalysisHistoryEntry } from "../public/history-snapshot.js";

const FORMULA_ID = "formula:c10:test";
const FORMULA_VERSION = "RU-2026-10";

function analyze(text = "Aqua, Glycerin, Niacinamide, Titanium Dioxide") {
  return analyzeComposition({
    text,
    formulaScope: "full",
    productName: "C10 test product",
    formulaEvidence: {
      formulaId: FORMULA_ID,
      version: FORMULA_VERSION,
      confirmation: "source_declared",
      source: { name: "Package label", type: "package_label", retrievedAt: "2026-10-05T10:00:00.000Z" }
    }
  });
}

function source(type, locator = "section 1") {
  return {
    name: type === "laboratory_report" ? "Finished product test report" : "Official product page",
    type,
    url: "https://example.test/evidence",
    locator,
    retrievedAt: "2026-10-05T10:00:00.000Z",
    checkedAt: "2026-10-05T10:30:00.000Z",
    productVersion: FORMULA_VERSION
  };
}

function measurement(overrides = {}) {
  return {
    property: "SPF",
    subject: { kind: "finished_product", id: FORMULA_ID, name: "C10 test product" },
    value: { kind: "exact", exact: 30 },
    unit: "SPF",
    basisStatus: "manufacturer_declared",
    formulaId: FORMULA_ID,
    formulaVersion: FORMULA_VERSION,
    source: source("official_brand_page", "SPF claim"),
    ...overrides
  };
}

function applyVerified(analysis, measurements) {
  return applyQuantitativeEvidence({ assessment: analysis.formulaAssessment, measurements, evidenceTrust: "server_verified" });
}

test("C10: absent measurements stay absent and INCI order creates no numbers", () => {
  const first = analyze("Niacinamide, Aqua, Glycerin");
  const second = analyze("Glycerin, Aqua, Niacinamide");
  assert.deepEqual(first.formulaAssessment.quantitative, []);
  assert.deepEqual(first.formulaAssessment.photoprotection.productMetrics, []);
  assert.deepEqual(first.formulaAssessment.duration, []);
  assert.equal(first.formulaAssessment.quantitativeDiagnostics.received, 0);
  assert.deepEqual(first.formulaAssessment.ingredients.map((item) => item.quantitative), [[], [], []]);
  assert.deepEqual(second.formulaAssessment.quantitative, []);
});

test("C10: client cannot promote its own manufacturer or test status", () => {
  const input = measurement({ basisStatus: "test_reported", source: source("laboratory_report", "table 4") });
  const result = analyzeComposition({
    text: "Aqua, Titanium Dioxide",
    formulaScope: "full",
    productName: "Client supplied test",
    formulaEvidence: { formulaId: FORMULA_ID, version: FORMULA_VERSION },
    productEvidence: { measurements: [input] }
  });
  const item = result.formulaAssessment.quantitative[0];
  assert.equal(item.basisStatus, "user_reported");
  assert.equal(item.claimedBasisStatus, "test_reported");
  assert.equal(result.formulaAssessment.quantitativeDiagnostics.downgraded, 1);
  assert.equal(result.formulaAssessment.photoprotection.productMetrics[0].testReported, false);
  assert.equal(result.formulaAssessment.photoprotection.productMetrics[0].independentlyVerified, false);
  assert.match(result.formulaAssessment.claims.find((claim) => claim.id === `claim:${item.id}`).text, /источник не проверен/i);
});

test("C10: SPF 50+ brand claim remains a lower-bound manufacturer claim", () => {
  const result = applyVerified(analyze(), [measurement({ value: "50+" })]);
  const item = result.quantitative[0];
  const metric = result.photoprotection.productMetrics[0];
  assert.deepEqual(item.value, { kind: "lower_bound", min: 50, label: "50+" });
  assert.equal(item.basisStatus, "manufacturer_declared");
  assert.equal(metric.testReported, false);
  assert.equal(metric.independentlyVerified, false);
  assert.match(result.claims.find((claim) => claim.id === metric.claimId).text, /заявляет/i);
  assert.match(result.claims.find((claim) => claim.id === metric.claimId).text, /не.*независимо подтвержд/i);
  assert.equal(validateFormulaAssessment(result).valid, true);
});

test("C10: verified finished-product tests remain separate SPF, UVA-PF and pH metrics", () => {
  const report = source("laboratory_report", "signed report tables 2-4");
  const result = applyVerified(analyze(), [
    measurement({ basisStatus: "test_reported", source: report, property: "SPF", value: 42, unit: "SPF" }),
    measurement({ basisStatus: "test_reported", source: report, property: "UVA-PF", value: 16, unit: "UVA-PF" }),
    measurement({ basisStatus: "test_reported", source: report, property: "critical_wavelength", value: 375, unit: "nm" }),
    measurement({ basisStatus: "test_reported", source: report, property: "pH", value: { kind: "range", min: 5.2, max: 5.6 }, unit: "pH" })
  ]);
  assert.equal(result.quantitative.length, 4);
  assert.equal(result.photoprotection.productMetrics.length, 3);
  assert.deepEqual(result.photoprotection.productMetrics.map((item) => item.property).sort(), ["SPF", "UVA-PF", "critical_wavelength"].sort());
  assert.ok(result.photoprotection.productMetrics.every((item) => item.testReported));
  assert.ok(result.photoprotection.productMetrics.every((item) => item.independentlyVerified === false));
  assert.equal(result.quantitative.find((item) => item.property === "pH").basisStatus, "test_reported");
  assert.equal(validateFormulaAssessment(result).valid, true);
});

test("C10: filter spectrum does not become product SPF or UVA-PF", () => {
  const result = applyVerified(analyze(), [measurement({
    property: "filter_spectrum",
    subject: { kind: "ingredient", name: "Titanium Dioxide" },
    value: ["UVA", "UVB"],
    unit: null,
    basisStatus: "manufacturer_declared",
    source: source("manufacturer_document", "filter specification")
  })]);
  const filter = result.photoprotection.filters.find((item) => item.spectrumClaimIds.length);
  assert.ok(filter);
  assert.equal(result.photoprotection.productMetrics.length, 0);
  assert.equal(result.quantitative.length, 0);
  assert.match(result.claims.find((claim) => claim.id === filter.spectrumClaimIds[0]).text, /не показатель SPF или UVA-PF/i);
});

test("C10: trade-mixture percentage is never assigned to a disclosed active", () => {
  const base = analyze("Aqua, RET Complex, Niacinamide");
  const result = applyVerified(base, [measurement({
    property: "concentration",
    subject: { kind: "trade_mixture", name: "RET Complex" },
    value: 5,
    unit: "%",
    basisStatus: "manufacturer_declared",
    source: source("manufacturer_document", "formula statement")
  })]);
  assert.equal(result.quantitative.length, 1);
  assert.equal(result.quantitative[0].subject.kind, "trade_mixture");
  assert.equal(result.quantitative[0].subject.name, "RET Complex");
  assert.equal(result.quantitative.some((item) => item.subject.name === "Niacinamide"), false);
  const mixture = result.ingredients.find((item) => item.input === "RET Complex");
  assert.deepEqual(mixture.quantitative, [result.quantitative[0].id]);
});

test("C10: only an internal call can retain a verified measurement status", () => {
  const result = analyzeComposition({
    text: "Aqua, Titanium Dioxide",
    formulaScope: "full",
    formulaEvidence: { formulaId: FORMULA_ID, version: FORMULA_VERSION },
    productEvidence: { measurements: [measurement({ basisStatus: "test_reported", source: source("laboratory_report", "table 4") })] },
    quantitativeEvidenceTrust: "server_verified"
  });
  assert.equal(result.formulaAssessment.quantitative[0].basisStatus, "test_reported");
  assert.equal(result.formulaAssessment.photoprotection.productMetrics[0].testReported, true);
  assert.equal(result.formulaAssessment.photoprotection.productMetrics[0].independentlyVerified, false);
});

test("C10: regulatory maxima, missing sources and mismatched formula versions create no product numbers", () => {
  const result = applyVerified(analyze(), [
    measurement({ property: "regulatory_maximum", value: 10, unit: "%" }),
    measurement({ property: "SPF", source: null }),
    measurement({ property: "SPF", formulaVersion: "OTHER-VERSION" })
  ]);
  assert.equal(result.quantitative.length, 0);
  assert.equal(result.photoprotection.productMetrics.length, 0);
  assert.equal(result.quantitativeDiagnostics.rejected.length, 3);
  assert.deepEqual(result.quantitativeDiagnostics.rejected.map((item) => item.reason).sort(), [
    "formula_identity_or_version_mismatch", "source_and_locator_are_required", "unsupported_property"
  ].sort());
});

test("C10: a percent sign cannot be silently reinterpreted as pH", () => {
  const result = applyVerified(analyze(), [measurement({ property: "pH", value: "5.5%", unit: "pH", basisStatus: "test_reported", source: source("laboratory_report") })]);
  assert.equal(result.quantitative.length, 0);
  assert.equal(result.quantitativeDiagnostics.rejected[0].reason, "invalid_value_or_unit");
});

test("C10: effect duration and reapplication instructions are distinct", () => {
  const report = source("laboratory_report", "duration report");
  const official = source("official_brand_page", "directions");
  const result = applyVerified(analyze(), [
    measurement({
      property: "effect_duration", value: 8, unit: "hours", effect: "hydration",
      basisStatus: "test_reported", source: report, conditions: { method: "finished_product_test" }
    }),
    measurement({
      property: "reapplication_interval", value: 2, unit: "hours",
      basisStatus: "manufacturer_declared", source: official, conditions: { context: "label_instruction" }
    })
  ]);
  const effect = result.duration.find((item) => item.kind === "effect_duration");
  const instruction = result.duration.find((item) => item.kind === "instruction_interval");
  assert.equal(effect.effect, "hydration");
  assert.equal(effect.doesNotEstablishEffectDuration, false);
  assert.equal(instruction.effect, "reapplication_instruction");
  assert.equal(instruction.doesNotEstablishEffectDuration, true);
  assert.ok(result.photoprotection.instructionClaimIds.includes(instruction.claimId));
});

test("C10: duration from an ingredient study cannot become finished-product duration", () => {
  const result = applyVerified(analyze(), [measurement({
    property: "effect_duration", subject: { kind: "ingredient", name: "Glycerin" },
    value: 12, unit: "hours", effect: "hydration", basisStatus: "test_reported",
    source: source("laboratory_report", "ingredient study")
  })]);
  assert.deepEqual(result.duration, []);
  assert.deepEqual(result.quantitative, []);
  assert.equal(result.quantitativeDiagnostics.rejected[0].reason, "duration_requires_finished_product_subject");
});

test("C10: enriched assessment is deterministic and survives history snapshot", () => {
  const text = "Aqua, Glycerin, Niacinamide, Titanium Dioxide";
  const initial = analyze(text);
  const measurements = [measurement({ value: "50+" })];
  const first = applyVerified(initial, measurements);
  const second = applyVerified(initial, measurements);
  assert.deepEqual(first, second);
  assert.equal(first.versions.quantitativeEvidence, QUANTITATIVE_EVIDENCE_VERSION);
  initial.formulaAssessment = first;
  const request = {
    text,
    productName: "C10 test product",
    evidence: { formula: { productId: FORMULA_ID, scope: "full", version: FORMULA_VERSION } }
  };
  initial.analysisContract = createAnalysisContract({ analysis: initial, request, generatedAt: "2026-10-05T12:00:00.000Z" });
  const entry = buildAnalysisHistoryEntry(request, initial, "Package label", { capturedAt: "2026-10-05T12:00:00.000Z" });
  const reopened = inspectAnalysisHistoryEntry(entry);
  assert.deepEqual(reopened.analysis.formulaAssessment.quantitative, first.quantitative);
  assert.deepEqual(reopened.analysis.formulaAssessment.photoprotection, first.photoprotection);
});
