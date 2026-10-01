import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { analyzeComposition } from "../src/analyzer.js";
import { createAnalysisContract, validateAnalysisContract } from "../src/analysisContract.js";
import { claimApplicability, evaluateExpertRules, validateExpertKnowledge } from "../src/services/expertRules.js";

const seed = JSON.parse(fs.readFileSync(new URL("../data/expert-claims.json", import.meta.url), "utf8"));
const formula = { formulaScope: "full", text: "Aqua, Glycerin, Petrolatum, Niacinamide, Phenoxyethanol" };
const input = (name = "Glycerin", status = "confirmed") => ({
  found: [{ name, input: name, status, roles: [], concentration: null }],
  assessment: { status: "not_assessed", reason: "unvalidated_scoring_method" },
  productSafety: { shouldScoreAsCosmetic: true }
});

test("T10: the small source-backed seed validates without claiming domain approval", () => {
  assert.deepEqual(validateExpertKnowledge(seed), []);
  assert.equal(seed.claims.length, 4);
  assert.ok(seed.claims.every((claim) => claim.review.status === "pending" && claim.review.reviewer === null));
  assert.ok(seed.sources.every((source) => source.checkedScope === "abstract_only"));
});

test("T10: schema rejects missing provenance, conditions, limitations and fake approval", () => {
  const mutations = [
    (data) => { data.claims[0].basis[0].sourceId = "missing"; },
    (data) => { data.claims[0].limitations = []; },
    (data) => { data.claims[0].conditions = {}; },
    (data) => { data.claims[0].conditions.magicProperty = "yes"; },
    (data) => { data.claims[0].review.status = "approved"; },
    (data) => { data.claims[0].checkedAt = "2026-02-31"; },
    (data) => { data.claims[0].ingredient = "RET Complex"; },
    (data) => { data.claims[1].ruleId = data.claims[0].ruleId; },
    (data) => { data.sources[0].url = "javascript:alert(1)"; },
    (data) => { data.claims[0] = null; }
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(seed);
    mutate(invalid);
    assert.ok(validateExpertKnowledge(invalid).length);
    assert.throws(() => evaluateExpertRules(input(), invalid), TypeError);
  }
});

test("T10: literature findings have rules, source locators, review labels and no product promise", () => {
  const result = analyzeComposition(formula);
  const claims = result.findings.filter((finding) => finding.kind === "expert");
  assert.equal(claims.length, 3);
  for (const claim of claims) {
    assert.ok(claim.ruleId && claim.version && claim.checkedAt);
    assert.match(claim.basis[0].url, /^https:\/\/pubmed.ncbi.nlm.nih.gov\//);
    assert.ok(claim.basis[0].locator);
    assert.equal(claim.review.status, "pending");
    assert.equal(claim.applicability.status, "conditional");
    assert.equal(claim.productEffectConfirmed, false);
    assert.match(claim.text, /Требует предметной проверки/);
  }
  assert.equal(result.evidenceCoverage.withClaims, 3);
  assert.equal(result.evidenceCoverage.withReviewedClaims, 0);
  assert.equal(result.qualitySummary.score, null);
  assert.equal(result.irritation_risk, null);
  assert.deepEqual(result.routineAdvice, []);
  assert.ok(result.found.every((item) => item.quality_score === null && item.ingredient_quality_score === null));
  for (const ruleId of result.expertSummaryRuleIds) assert.ok(result.findings.some((finding) => finding.ruleId === ruleId));
});

test("T10: CosIng functions map to reference groups without invented clinical evidence", () => {
  const result = analyzeComposition({ text: "Aqua, Glycerin, Phenoxyethanol" });
  const group = result.groups.find((item) => item.ruleId === "reference.cosing.humectants");
  assert.ok(group.items.includes("Glycerin"));
  assert.equal(group.kind, "reference");
  const glycerin = result.found.find((item) => item.name === "Glycerin");
  const functions = glycerin.findings.filter((finding) => finding.kind === "reference");
  assert.ok(functions.some((finding) => finding.basis[0].function === "HAIR CONDITIONING"));
  assert.ok(functions.every((finding) => finding.review.status === "reference_only"));
  assert.notEqual(result.productSafety.type, "hair_scalp");
  assert.equal(glycerin.evidence_level, "not_assessed");
  assert.ok(functions.every((finding) => finding.basis[0].checkedAt === null));
});

test("T10: unsupported CosIng functions stay untranslated references, not guessed effects", () => {
  const result = evaluateExpertRules(input());
  const oralCare = result.findings.find((finding) => finding.basis[0]?.function === "ORAL CARE");
  assert.ok(oralCare);
  assert.match(oralCare.ruleId, /unmapped:/);
  assert.equal(oralCare.kind, "reference");
});

test("T10: unknown, suggested and proprietary identities cannot acquire expert claims", () => {
  const result = analyzeComposition({ text: "RET Complex, Fictitiousol, Hamamelis Virginiana Extract" });
  assert.equal(result.findings.filter((finding) => finding.kind === "expert").length, 0);
  assert.equal(result.irritation_risk, null);
  assert.ok(result.findings.some((finding) => finding.ruleId === "guard.unknown-risk"));
  assert.ok(result.findings.some((finding) => finding.ruleId === "guard.undisclosed"));
  assert.deepEqual(result.groups, []);
  for (const status of ["suggested", "unknown"]) {
    const uncertain = evaluateExpertRules(input("Glycerin", status));
    assert.equal(uncertain.expertFindings.length, 0);
    assert.equal(uncertain.groups.length, 0);
  }
});

test("T10: registry-only and empty expert coverage do not establish zero risk", () => {
  const dataset = structuredClone(seed);
  dataset.claims = [];
  const result = evaluateExpertRules(input(), dataset);
  assert.equal(result.expertFindings.length, 0);
  assert.ok(result.groups.length);
  assert.equal(result.finishedProduct.irritationRisk.value, null);
  assert.ok(result.limitations.some((finding) => finding.ruleId === "guard.no-expert-claim"));
  const registryOnly = analyzeComposition({ formulaScope: "full", text: "Hydroxyethylcellulose, Potassium Phosphate" });
  assert.equal(registryOnly.irritation_risk, null);
  assert.doesNotMatch(registryOnly.summary, /красных флагов|низкая настороженность/);
});

test("T10: applicability is conditional with missing data and blocked on conflicting data", () => {
  const conditions = seed.claims[0].conditions;
  assert.equal(claimApplicability(conditions).status, "conditional");
  assert.equal(claimApplicability(conditions, { applicationSite: "face", usage: "leave_on", productForm: "emollient cream" }).status, "context_matches");
  assert.equal(claimApplicability(conditions, { applicationSite: "hair", usage: "rinse_off" }).status, "not_applicable");
  const result = evaluateExpertRules({ ...input(), context: { applicationSite: "hair", usage: "rinse_off" } });
  assert.equal(result.expertFindings[0].applicability.status, "not_applicable");
  assert.match(result.expertFindings[0].text, /Условия не соответствуют/);
  assert.equal(result.expertFindings[0].productEffectConfirmed, false);
});

test("T10: even a reviewed claim with matching study context cannot prove product efficacy", () => {
  const dataset = structuredClone(seed);
  dataset.claims[0].review = { status: "approved", reviewer: "TEST FIXTURE ONLY", reviewedAt: "2026-09-29" };
  dataset.claims[0].evidenceStatus = "verified";
  const result = evaluateExpertRules({ ...input(), context: { applicationSite: "skin", usage: "leave_on", productForm: "emollient cream" } }, dataset);
  assert.equal(result.expertFindings[0].review.status, "approved");
  assert.equal(result.expertFindings[0].applicability.status, "context_matches");
  assert.equal(result.expertFindings[0].productEffectConfirmed, false);
  assert.equal(result.finishedProduct.efficacy.value, null);
});

test("T10: rejected claims do not appear in the report", () => {
  const dataset = structuredClone(seed);
  dataset.claims[0].review.status = "rejected";
  assert.equal(evaluateExpertRules(input(), dataset).expertFindings.length, 0);
});

test("T10: noncosmetic detection takes priority over cosmetic literature", () => {
  const result = analyzeComposition({ text: "Aqua, Glycerin, Prilocaine Hydrochloride, Niacinamide" });
  assert.equal(result.productSafety.shouldScoreAsCosmetic, false);
  assert.equal(result.findings.filter((finding) => finding.kind === "expert").length, 0);
  assert.ok(result.findings.some((finding) => finding.ruleId === "guard.non-cosmetic"));
  assert.deepEqual(result.routineAdvice, []);
  assert.match(result.productSafety.application, /не определяется/);
});

test("T10: product measurements are never inferred from INCI position or study concentrations", () => {
  const result = analyzeComposition({ formulaScope: "full", text: "Niacinamide, Zinc Oxide, Retinol, Glycerin" });
  for (const metric of Object.values(result.finishedProductAssessment)) {
    assert.equal(metric.value, null);
    assert.equal(metric.status, "not_assessed");
    assert.equal(metric.ruleId, "guard.product-evidence");
  }
  assert.ok(result.found.every((item) => item.concentration === null));
  assert.deepEqual(result.routineAdvice, []);
});

test("T10: analysis and rule provenance are deterministic, versioned and serializable", () => {
  const first = analyzeComposition(formula);
  assert.deepEqual(analyzeComposition(formula), first);
  assert.deepEqual(JSON.parse(JSON.stringify(first)).findings, first.findings);
  assert.match(first.evidenceVersions.registrySha256, /^[a-f0-9]{64}$/);
  assert.match(first.evidenceVersions.localAdditionsSha256, /^[a-f0-9]{64}$/);
  assert.match(first.evidenceVersions.knowledgeSha256, /^[a-f0-9]{64}$/);
  for (const finding of first.findings) assert.ok(finding.ruleId && finding.version && finding.basis.length);
  const contract = createAnalysisContract({ analysis: first, request: formula });
  assert.deepEqual(contract.evidenceVersions, first.evidenceVersions);
  assert.equal(validateAnalysisContract(contract).valid, true);
  const invalid = structuredClone(contract);
  invalid.evidenceVersions.registrySha256 = "unversioned";
  assert.equal(validateAnalysisContract(invalid).valid, false);
  const invalidLocal = structuredClone(contract);
  invalidLocal.evidenceVersions.localAdditionsSha256 = "unversioned";
  assert.equal(validateAnalysisContract(invalidLocal).valid, false);
  delete contract.evidenceVersions;
  contract.algorithmVersion = "analyzer-v2-inci";
  assert.equal(validateAnalysisContract(contract).valid, true);
  const untouched = structuredClone(first);
  first.findings[0].basis[0].version = "mutated-by-consumer";
  assert.deepEqual(analyzeComposition(formula), untouched);
});
