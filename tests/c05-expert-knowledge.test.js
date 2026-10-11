import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateExpertKnowledge, evaluateExpertRules } from "../src/services/expertRules.js";
import { claimRevisionHash, claimRevisionSnapshot, reviewContentHash } from "../src/services/expertKnowledge.js";
import { approveFixtureClaim, sealFixtureRevision } from "./helpers/expert-knowledge.js";
import { buildAnalysisHistoryEntry, inspectAnalysisHistoryEntry } from "../public/history-snapshot.js";

const seed = JSON.parse(fs.readFileSync(new URL("../data/expert-claims.json", import.meta.url), "utf8"));
const input = (context = {}) => ({ found: [{ name: "Glycerin", input: "Glycerin", status: "confirmed" }],
  assessment: { reason: "unvalidated_scoring_method" }, productSafety: { shouldScoreAsCosmetic: true }, context });
const first = (data, context = {}) => evaluateExpertRules(input(context), data).expertFindings[0];

function fixture(type = "technical_document", conclusionType = "technical_property", scope = "full_text") {
  const data = structuredClone(seed);
  data.claims = [data.claims[0]];
  data.sources = [data.sources[0]];
  const claim = data.claims[0];
  const subject = { kind: "substance", id: "Glycerin", formulaVersion: null };
  Object.assign(data.sources[0], { type, checkedScope: scope, subject, title: "SYNTHETIC C05 SOURCE; NOT SCIENTIFIC EVIDENCE",
    url: "https://example.test/c05", context: "Test fixture only", version: "test-1", conditions: { usage: "leave_on", productType: "cream" } });
  Object.assign(claim, { subject: structuredClone(subject), conclusionType, conditions: { usage: "leave_on", productType: "cream" },
    unknownReasons: [], possibleContribution: "SYNTHETIC ASSERTION FOR SCHEMA TEST", riskAssessment: { status: "insufficient_data", statements: [], limitations: ["Test only"] } });
  approveFixtureClaim(data, claim);
  return data;
}

test("C05: every admitted source type has a bounded conclusion type", () => {
  for (const [type, conclusion, scope] of [
    ["primary_study_abstract", "literature_observation", "abstract_only"],
    ["study", "literature_observation", "full_text"], ["review", "literature_observation", "full_text"],
    ["technical_document", "technical_property", "relevant_section"],
    ["ingredient_reference", "reference_function", "record"],
    ["manufacturer_page", "manufacturer_declaration", "product_page"],
    ["package_label", "manufacturer_declaration", "label"],
    ["third_party_catalog", "catalog_report", "record"]
  ]) {
    const data = fixture(type, conclusion, scope);
    assert.deepEqual(validateExpertKnowledge(data), [], type);
    assert.equal(first(data, { usage: "leave_on", productType: "cream" }).conclusionSupported, true);
    data.claims[0].conclusionType = "product_test_result";
    sealFixtureRevision(data.claims[0]);
    assert.ok(validateExpertKnowledge(data).some((error) => error.includes("source cannot support")), type);
  }
});

test("C05: regulatory rules require matching jurisdiction, version, date and concentration", () => {
  const data = fixture("regulatory_document", "regulatory_restriction", "relevant_section");
  data.sources[0].regulation = { jurisdiction: "TEST-EU", version: "test-annex-v1", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" };
  const claim = data.claims[0];
  Object.assign(claim.conditions, { jurisdiction: "TEST-EU", regulatoryVersion: "test-annex-v1", concentrationPercent: { min: 0, max: 5 } });
  approveFixtureClaim(data, claim);
  assert.deepEqual(validateExpertKnowledge(data), []);
  const context = { usage: "leave_on", productType: "cream", jurisdiction: "TEST-EU", regulatoryVersion: "test-annex-v1", assessmentDate: "2026-10-03",
    concentrations: { Glycerin: { subjectKind: "substance", subjectId: "Glycerin", value: 3, unit: "percent", verification: "source_checked", sourceId: "test-label" } } };
  assert.equal(first(data, context).conclusionSupported, true);
  for (const changes of [{ jurisdiction: "TEST-RU" }, { regulatoryVersion: "test-annex-v2" }, { assessmentDate: "2027-01-01" }, { productType: "shampoo" }, { usage: "rinse_off" }]) {
    const finding = first(data, { ...context, ...changes });
    assert.equal(finding.applicability.status, "not_applicable");
    assert.equal(finding.conclusionSupported, false);
  }
  for (const missing of ["jurisdiction", "regulatoryVersion", "assessmentDate", "productType", "concentrations"]) {
    const partial = structuredClone(context);
    delete partial[missing];
    assert.equal(first(data, partial).applicability.status, "conditional", missing);
    assert.equal(first(data, partial).conclusionSupported, false, missing);
  }
  for (const value of [6, 100]) {
    const outside = structuredClone(context);
    outside.concentrations.Glycerin.value = value;
    assert.equal(first(data, outside).applicability.status, "not_applicable");
  }
  for (const value of [null, "3", NaN, -1]) {
    const invalid = structuredClone(context);
    invalid.concentrations.Glycerin.value = value;
    assert.equal(first(data, invalid).applicability.status, "conditional");
  }
  const mixture = structuredClone(context);
  mixture.concentrations.Glycerin.subjectKind = "trade_mixture";
  assert.equal(first(data, mixture).conclusionSupported, false);
  const user = structuredClone(context);
  user.concentrations.Glycerin.verification = "user_reported";
  assert.equal(first(data, user).conclusionSupported, false);
  delete data.sources[0].regulation;
  assert.ok(validateExpertKnowledge(data).some((error) => error.includes("regulation")));
});

test("C05: a product test is bound to its exact tested formula and never confirms ingredient efficacy", () => {
  const data = fixture("product_test", "product_test_result", "full_report");
  const subject = { kind: "finished_product", id: "TEST-FORMULA", formulaVersion: "TEST-V1" };
  data.sources[0].subject = subject;
  data.sources[0].method = "SYNTHETIC TEST METHOD";
  data.claims[0].subject = structuredClone(subject);
  approveFixtureClaim(data, data.claims[0]);
  assert.deepEqual(validateExpertKnowledge(data), []);
  const context = { usage: "leave_on", productType: "cream", formulaId: "TEST-FORMULA", formulaVersion: "TEST-V1" };
  const supported = first(data, context);
  assert.equal(supported.conclusionSupported, true);
  assert.equal(supported.subject.kind, "finished_product");
  assert.equal(supported.productEffectConfirmed, false);
  assert.equal(first(data, { ...context, formulaVersion: "TEST-V2" }).conclusionSupported, false);
  assert.equal(first(data, { ...context, formulaId: "ANOTHER-CREAM" }).conclusionSupported, false);
  assert.equal(first(data, { ...context, formulaVersion: null }).applicability.status, "conditional");
  data.claims[0].subject = { kind: "substance", id: "Glycerin", formulaVersion: null };
  sealFixtureRevision(data.claims[0]);
  assert.ok(validateExpertKnowledge(data).some((error) => error.includes("subjects differ")));
});

test("C05: full-text and document claims cannot be supported by an abstract or catalog", () => {
  const data = fixture();
  for (const [type, scope] of [["study", "abstract_only"], ["review", "abstract_only"], ["product_test", "product_page"]]) {
    const invalid = structuredClone(data);
    Object.assign(invalid.sources[0], { type, checkedScope: scope });
    assert.ok(validateExpertKnowledge(invalid).some((error) => error.includes("Invalid source")));
  }
  data.sources[0].type = "third_party_catalog";
  data.sources[0].checkedScope = "record";
  assert.ok(validateExpertKnowledge(data).some((error) => error.includes("source cannot support")));
});

test("C05: signatures require registered humans and bind the rule and source content", () => {
  const original = fixture();
  for (const mutate of [
    (data) => { data.reviewers = []; },
    (data) => { data.reviewers[0].kind = "model"; },
    (data) => { delete data.reviewers[0].verification; },
    (data) => { delete data.claims[0].review.artifactRef; },
    (data) => { data.claims[0].review.claimVersion = "old"; },
    (data) => { data.claims[0].possibleContribution = "Changed text"; sealFixtureRevision(data.claims[0]); },
    (data) => { data.sources[0].context = "Changed source"; },
    (data) => { delete data.sources[0].artifactRef; },
    (data) => { data.claims[0].review.contentHash = "0".repeat(64); }
  ]) {
    const invalid = structuredClone(original);
    mutate(invalid);
    assert.ok(validateExpertKnowledge(invalid).length);
    assert.throws(() => first(invalid), TypeError);
  }
  assert.deepEqual(seed.reviewers, []);
  assert.ok(seed.claims.every((claim) => claim.review.status === "pending"));
});

test("C05: a rule cannot drop or broaden conditions documented by the source", () => {
  const data = fixture();
  delete data.claims[0].conditions.productType;
  approveFixtureClaim(data, data.claims[0]);
  assert.ok(validateExpertKnowledge(data).some((error) => error.includes("source condition broadened")));
  const range = fixture();
  range.sources[0].conditions.concentrationPercent = { min: 2, max: 5 };
  range.claims[0].conditions.concentrationPercent = { min: 1, max: 10 };
  approveFixtureClaim(range, range.claims[0]);
  assert.ok(validateExpertKnowledge(range).some((error) => error.includes("source condition broadened")));
  range.claims[0].conditions.concentrationPercent = { min: 3, max: 4 };
  approveFixtureClaim(range, range.claims[0]);
  assert.deepEqual(validateExpertKnowledge(range), []);
});

test("C05: unknown reasons and pending reviews never produce positive confirmation", () => {
  const data = fixture();
  data.claims[0].unknownReasons = ["required_data_unavailable"];
  approveFixtureClaim(data, data.claims[0]);
  assert.equal(first(data, { usage: "leave_on", productType: "cream" }).applicability.status, "conditional");
  assert.equal(first(data, { usage: "leave_on", productType: "cream" }).conclusionSupported, false);
  const pending = structuredClone(seed);
  assert.equal(first(pending).conclusionSupported, false);
  assert.ok(first(pending).unknownReasons.includes("domain_review_pending"));
});

test("C05: withdrawn rules disappear from new analyses while saved snapshots retain their original version", () => {
  const data = fixture();
  const context = { usage: "leave_on", productType: "cream" };
  const result = evaluateExpertRules(input(context), data);
  const entry = buildAnalysisHistoryEntry({ text: "Glycerin" }, { findings: result.findings, evidenceVersions: result.versions });
  const before = JSON.stringify(entry);
  const claim = data.claims[0];
  const history = structuredClone(claim.versionHistory);
  claim.version = "2.0.1";
  claim.lifecycle = { status: "withdrawn", changedAt: "2026-10-03", reason: "TEST RETRACTION", replacedBy: null };
  claim.review = { status: "pending", reviewer: null, reviewedAt: null };
  claim.evidenceStatus = "review_required";
  claim.versionHistory = [...history, { version: claim.version, changedAt: "2026-10-03", change: "TEST WITHDRAWAL",
    snapshot: claimRevisionSnapshot(claim), contentHash: claimRevisionHash(claim), previousHash: history.at(-1).contentHash }];
  assert.deepEqual(validateExpertKnowledge(data), []);
  assert.equal(evaluateExpertRules(input(context), data).expertFindings.length, 0);
  assert.equal(JSON.stringify(entry), before);
  const restored = inspectAnalysisHistoryEntry(entry).analysis.findings.find((finding) => finding.kind === "expert");
  assert.equal(restored.version, "2.0.0");
  assert.equal(restored.lifecycle.status, "active");
  assert.equal(restored.review.contentHash, reviewContentHash(history[0].snapshot, data.sources));
  data.claims[0].versionHistory[1].previousHash = "0".repeat(64);
  assert.ok(validateExpertKnowledge(data).some((error) => error.includes("version history")));
});

test("C05: old 1.1 knowledge stays readable but cannot confer a new verified conclusion", () => {
  const data = structuredClone(seed);
  data.schemaVersion = "1.1";
  data.claims = seed.claims.map((claim) => ({ ...structuredClone(claim.versionHistory[0].snapshot), review: { status: "approved", reviewer: "LEGACY SIGNATURE", reviewedAt: "2026-09-29" }, evidenceStatus: "verified" }));
  assert.deepEqual(validateExpertKnowledge(data), []);
  const finding = first(data, { usage: "leave_on", applicationSite: "face", productForm: "emollient cream" });
  assert.equal(finding.review.status, "pending");
  assert.equal(finding.conclusionSupported, false);
  const saved = { payload: { analysis: { findings: [{ kind: "expert", ruleId: "legacy", version: "1.0.0", text: "Historical text" }] } } };
  assert.deepEqual(inspectAnalysisHistoryEntry(saved).analysis, saved.payload.analysis);
});

test("C05: a superseded rule requires an active replacement and cannot appear alongside it", () => {
  const data = fixture();
  const previous = data.claims[0];
  const replacement = structuredClone(previous);
  replacement.ruleId = "test.replacement";
  data.claims.push(replacement);
  approveFixtureClaim(data, replacement);
  previous.lifecycle = { status: "superseded", changedAt: "2026-10-03", reason: "TEST REPLACEMENT", replacedBy: replacement.ruleId };
  approveFixtureClaim(data, previous);
  assert.deepEqual(validateExpertKnowledge(data), []);
  assert.deepEqual(evaluateExpertRules(input(), data).expertFindings.map((finding) => finding.ruleId), [replacement.ruleId]);
  previous.lifecycle.replacedBy = "missing";
  approveFixtureClaim(data, previous);
  assert.ok(validateExpertKnowledge(data).some((error) => error.includes("active replacement")));
});

test("C05: malformed structures yield validation errors instead of passing or crashing", () => {
  for (const mutate of [
    (data) => { data.claims[0].basis = {}; }, (data) => { data.claims[0].versionHistory = [null]; },
    (data) => { data.reviewers = {}; }, (data) => { data.sources[0].type = "toString"; },
    (data) => { data.claims[0].conditions = []; }, (data) => { data.sources[0] = null; },
    (data) => { data.claims[0].basis = [null]; }
  ]) {
    const data = fixture();
    mutate(data);
    assert.ok(validateExpertKnowledge(data).length);
  }
});
