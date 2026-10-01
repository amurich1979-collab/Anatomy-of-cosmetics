import assert from "node:assert/strict";
import test from "node:test";
import { analyzeComposition } from "../src/analyzer.js";
import { evaluatePersonalization } from "../src/services/personalization.js";
import { normalizeAnalysisProfile, hasPersonalProfile, isSessionOnlyHistory } from "../public/analysis-profile.js";
import { app } from "../src/server.js";

const formula = { text: "Aqua, Glycerin, Petrolatum, Niacinamide, Phenoxyethanol", formulaScope: "full", productName: "Face cream" };
const analyze = (profile = {}, extra = {}) => analyzeComposition({ ...formula, ...extra, profile });

test("T14: empty profile remains neutral and cannot establish individual safety", () => {
  const result = analyze();
  assert.equal(result.personalization.status, "general_only");
  assert.equal(result.personalization.profileProvided, false);
  assert.deepEqual(result.personalization.usedInputs, []);
  assert.ok(result.personalization.missingFields.includes("allergyStatus"));
  assert.equal(result.personalization.safetyEstablished, false);
});

test("T14: a user-reported confirmed allergy matching INCI blocks application", () => {
  const result = analyze({ allergyStatus: "reported", allergens: ["Phenoxyethanol"] });
  assert.equal(result.personalization.status, "blocked");
  assert.ok(result.personalization.restrictions.some((x) => x.ruleId === "personal.allergen-match"));
  assert.deepEqual(result.personalization.potentialBenefits, []);
  assert.deepEqual(result.routineAdvice, []);
  assert.ok(result.warnings[0].includes("Phenoxyethanol"));
});

test("T14: an unrecognized allergen is unresolved, never an absent allergy", () => {
  const p = analyze({ allergyStatus: "reported", allergens: ["Unknown trade mixture"] }).personalization;
  assert.equal(p.status, "review_required");
  assert.ok(p.precautions.some((x) => x.ruleId === "personal.unresolved-allergen"));
  assert.equal(p.safetyEstablished, false);
});

test("T14: relevant profile changes are explained; unrelated properties have no effect", () => {
  const base = analyze({ goals: ["hydration"], applicationArea: "face" });
  const ignored = analyze({ goals: ["hydration"], applicationArea: "face", favouriteColor: "blue", concentrationPercent: 5 });
  assert.deepEqual(base.personalization, ignored.personalization);
  assert.ok(base.personalization.goalReferences.length);
  const reaction = analyze({ previousReaction: "this_product" }).personalization;
  assert.equal(reaction.status, "blocked");
  assert.ok(reaction.usedInputs.some((x) => x.field === "previousReaction"));
});

test("T14: pending literature and sensitive context do not turn into personal treatment", () => {
  const result = analyze({ skinType: "чувствительная", context: "после процедуры", concerns: "беременность", goals: ["hydration"] });
  assert.equal(result.personalization.status, "review_required");
  assert.deepEqual(result.personalization.potentialBenefits, []);
  assert.ok(result.personalization.limitations.some((x) => /предметн/i.test(x)));
  assert.deepEqual(result.routineAdvice, []);
});

test("T14: a medical class and area mismatch override cosmetic goals", () => {
  const medical = analyze({ goals: ["hydration"] }, { text: "Aqua, Lidocaine, Glycerin" });
  assert.equal(medical.personalization.status, "blocked");
  assert.deepEqual(medical.personalization.goalReferences, []);
  const mismatch = analyze({ applicationArea: "face" }, {
    productName: "Shampoo", productEvidence: { identificationStatus: "confirmed", name: "Hair shampoo", category: "Shampoo", source: { name: "Brand", type: "official_brand_page", url: "https://example.test/shampoo" } }
  });
  assert.ok(mismatch.personalization.restrictions.some((x) => x.ruleId === "personal.area-mismatch"));
});

test("T14: every allergy warning survives a long formula without list truncation", () => {
  const allergens = ["Aqua", "Glycerin", "Petrolatum", "Niacinamide", "Phenoxyethanol", "Panthenol", "Squalane", "Allantoin", "Urea", "Dimethicone", "Cetearyl Alcohol", "Citric Acid"];
  const result = analyze({ allergens }, { text: allergens.join(", ") });
  assert.equal(result.personalization.restrictions.length, allergens.length);
  for (const name of allergens) assert.ok(result.warnings.some((x) => x.includes(name)), name);
});

test("T14: reviewed findings require matching conditions and cannot outrank restrictions", () => {
  // Synthetic policy fixture, not an approval of a clinical claim in the dataset.
  const profile = { skinType: "сухая", context: "домашний уход", goals: ["hydration"], applicationArea: "face", allergyStatus: "none_reported", previousReaction: "none_reported" };
  const claim = { ruleId: "literature.glycerin.hydration", text: "TEST ONLY", basis: [{ url: "https://example.test/evidence" }], evidenceStatus: "verified", review: { status: "approved" }, applicability: { status: "context_matches" }, riskAssessment: { status: "insufficient_data", statements: [] } };
  const input = { profile, found: [{ name: "Glycerin", status: "confirmed" }], unknown: [], formulaScope: "full", productSafety: { purposeStatus: "confirmed_manufacturer", applicationArea: { value: "face" } }, evidence: { groups: [], expertFindings: [claim] } };
  assert.equal(evaluatePersonalization(input).potentialBenefits.length, 1);
  assert.equal(evaluatePersonalization({ ...input, profile: { ...profile, allergens: ["Glycerin"] } }).potentialBenefits.length, 0);
  claim.applicability.status = "conditional";
  assert.equal(evaluatePersonalization(input).potentialBenefits.length, 0);
  claim.applicability.status = "context_matches";
  claim.review.status = "pending";
  assert.equal(evaluatePersonalization(input).potentialBenefits.length, 0);
  claim.review.status = "approved";
  claim.riskAssessment = { status: "assessed", statements: ["TEST PRECAUTION"] };
  const guarded = evaluatePersonalization(input);
  assert.equal(guarded.potentialBenefits.length, 0);
  assert.equal(guarded.precautions[0].sources[0].url, "https://example.test/evidence");
});

test("T14: personal context reaches literature conditions without inventing concentration", () => {
  const a = analyze({ applicationArea: "hair_or_scalp" });
  const claim = a.findings.find((x) => x.ruleId === "literature.niacinamide.appearance");
  assert.equal(claim.applicability.status, "not_applicable");
  assert.ok(claim.applicability.conflicts.includes("applicationSite"));
  assert.ok(claim.applicability.missing.includes("concentrationPercent"));
  const invalid = normalizeAnalysisProfile({ allergens: Array(101).fill("Aqua") });
  assert.equal(analyze(invalid).personalization.status, "review_required");
  assert.equal(hasPersonalProfile(invalid), true);
  assert.deepEqual(normalizeAnalysisProfile({ allergens: "1,2-Hexanediol; Glycerin" }).allergens, ["1,2-Hexanediol", "Glycerin"]);
});

test("T14: session-only policy covers nested profile snapshots and malformed sensitive input", () => {
  assert.equal(isSessionOnlyHistory({ payload: { profile: { allergens: ["Glycerin"] } } }), true);
  assert.equal(isSessionOnlyHistory({ payload: { analysis: { analysisContract: { profile: { previousReaction: "this_product" } } } } }), true);
  assert.equal(isSessionOnlyHistory({ analysis: analyze({ context: "после процедуры" }) }), true);
  assert.equal(isSessionOnlyHistory({ analysis: analyze() }), false);
  assert.equal(isSessionOnlyHistory({ profile: { allergens: 123 } }), true);
});

test("T14: HTTP analysis preserves personal restrictions and suppresses application/analog advice", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analyze`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...formula, profile: { allergens: ["Glycerin"] }, evidence: { formula: { scope: "full" }, product: { identificationStatus: "confirmed", name: "Face cream", useInstructions: "Apply twice daily.", source: { name: "Brand", type: "official_brand_page", url: "https://example.test/cream" } } } })
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const result = await response.json();
  assert.equal(result.personalization.status, "blocked");
  assert.equal(result.historyPolicy.mode, "session_only");
  assert.equal(result.analysisContract.profile.allergens[0], "Glycerin");
  assert.deepEqual(result.alternatives, []);
  assert.doesNotMatch(result.productSafety.application, /Apply twice daily/);
  assert.equal(result.productSafety.applicationEvidence.status, "withheld");
});
