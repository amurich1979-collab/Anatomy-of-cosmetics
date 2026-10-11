import assert from "node:assert/strict";
import test from "node:test";
import { analyzeComposition } from "../src/analyzer.js";
import { validateFormulaAssessment } from "../src/services/formulaSystems.js";
import { evaluatePersonalization, PERSONALIZATION_VERSION } from "../src/services/personalization.js";
import { isSessionOnlyHistory } from "../public/analysis-profile.js";

const completeProfile = {
  skinType: "нормальная",
  context: "домашний уход",
  goals: ["hydration"],
  applicationArea: "face",
  allergyStatus: "none_reported",
  previousReaction: "none_reported"
};

function approvedFinding(overrides = {}) {
  return {
    ruleId: "literature.glycerin.hydration",
    text: "TEST FIXTURE ONLY: ограниченное соответствие цели.",
    basis: [{ type: "study", url: "https://example.test/evidence", locator: "fixture section" }],
    evidenceStatus: "verified",
    review: { status: "approved" },
    applicability: { status: "context_matches", missing: [], conflicts: [] },
    conclusionSupported: true,
    riskAssessment: { status: "insufficient_data", statements: [] },
    ...overrides
  };
}

function directPersonalization(profile, finding = approvedFinding(), overrides = {}) {
  return evaluatePersonalization({
    profile,
    found: [{ name: "Glycerin", status: "confirmed", excludedFromScoring: false }],
    unknown: [],
    formulaScope: "full",
    productSafety: {
      shouldScoreAsCosmetic: true,
      purposeStatus: "confirmed_manufacturer",
      applicationArea: { value: "face", source: { type: "official_brand_page" } },
      exposure: { mode: "leave_on" }
    },
    evidence: {
      groups: [{ ruleId: "reference.cosing.humectants", role: "Увлажнитель", items: ["Glycerin"] }],
      expertFindings: finding ? [finding] : []
    },
    ...overrides
  });
}

test("C11: the same formula changes only the profile-dependent conclusion", () => {
  const potential = directPersonalization(completeProfile);
  const restricted = directPersonalization({ ...completeProfile, allergens: ["Glycerin"] });
  assert.equal(potential.status, "potential_fit");
  assert.equal(restricted.status, "blocked");
  assert.equal(restricted.restrictions[0].ruleId, "personal.allergen-match");
  assert.equal(potential.goalAssessments[0].evidenceStatus, "potential_match");
  assert.equal(restricted.goalAssessments[0].evidenceStatus, "potential_match");
  assert.equal(restricted.goalAssessments[0].applicationStatus, "restricted");
  assert.equal(restricted.applicationAdviceAllowed, false);
});

test("C11: an unrelated precaution does not erase supported goal evidence", () => {
  const result = directPersonalization({ ...completeProfile, previousReaction: "other_product" });
  assert.equal(result.status, "review_required");
  assert.equal(result.precautions[0].ruleId, "personal.other-reaction");
  assert.equal(result.potentialBenefits.length, 1);
  assert.equal(result.potentialBenefits[0].applicationAdviceAllowed, false);
  assert.equal(result.goalAssessments[0].evidenceStatus, "potential_match");
  assert.equal(result.goalAssessments[0].applicationStatus, "caution");
});

test("C11: an unused missing skin type does not block a hydration conclusion", () => {
  const { skinType: _skinType, ...withoutSkinType } = completeProfile;
  const result = directPersonalization(withoutSkinType);
  assert.equal(result.status, "potential_fit");
  assert.ok(result.missingFields.includes("skinType"));
  assert.equal(result.goalAssessments[0].evidenceStatus, "potential_match");
  assert.equal(result.missingInputsByConclusion.some((item) => item.fields.includes("skinType")), false);
});

test("C11: pending or unsupported evidence cannot become a personal match", () => {
  const pending = approvedFinding({ review: { status: "pending" }, conclusionSupported: false });
  const result = directPersonalization(completeProfile, pending);
  assert.equal(result.status, "insufficient_data");
  assert.deepEqual(result.potentialBenefits, []);
  assert.equal(result.goalAssessments[0].evidenceStatus, "reference_only");
  assert.ok(result.goalAssessments[0].missingInputs.includes("approvedEvidence"));
});

test("C11: allergy, previous reaction and medical class keep safety priority", () => {
  const allergy = directPersonalization({ ...completeProfile, allergens: ["Glycerin"] });
  const reaction = directPersonalization({ ...completeProfile, previousReaction: "this_product" });
  const medical = analyzeComposition({
    text: "Aqua, Glycerin, Lidocaine",
    formulaScope: "full",
    profile: completeProfile
  });
  assert.equal(allergy.status, "blocked");
  assert.equal(reaction.status, "blocked");
  assert.equal(medical.personalization.status, "blocked");
  assert.ok(medical.personalization.restrictions.some((item) => item.ruleId === "personal.non-cosmetic"));
  assert.equal(medical.personalization.goalReferences.length, 1);
  assert.equal(medical.personalization.goalReferences[0].applicationStatus, "restricted");
  assert.deepEqual(medical.routineAdvice, []);
});

test("C11: free-text concerns create caution, never a diagnosis or invented contraindication", () => {
  const result = directPersonalization({ ...completeProfile, concerns: "непонятная сыпь" });
  const serialized = JSON.stringify(result);
  assert.equal(result.status, "review_required");
  assert.ok(result.precautions.some((item) => item.ruleId === "personal.unverified-clinical-context"));
  assert.doesNotMatch(serialized, /диагноз:\s|противопоказан|лечени[ея]:/i);
  assert.equal(result.safetyEstablished, false);
});

test("C11: formula assessment keeps general systems and resolves every personal claim", () => {
  const common = {
    text: "Aqua, Glycerin, Phenoxyethanol",
    formulaScope: "full",
    productName: "Face cream",
    productEvidence: {
      identificationStatus: "confirmed",
      name: "Face cream",
      category: "Face cream",
      source: { name: "Official brand", type: "official_brand_page", url: "https://example.test/cream" }
    }
  };
  const general = analyzeComposition(common);
  const personalized = analyzeComposition({ ...common, profile: { goals: ["hydration"], allergens: ["Phenoxyethanol"] } });
  assert.deepEqual(personalized.formulaAssessment.systems, general.formulaAssessment.systems);
  assert.equal(personalized.formulaAssessment.personalFit.status, "restricted");
  assert.ok(personalized.formulaAssessment.personalFit.goalMatchClaimIds.length);
  assert.ok(personalized.formulaAssessment.personalFit.restrictionClaimIds.length);
  assert.equal(validateFormulaAssessment(personalized.formulaAssessment).valid, true);
  const claimIds = new Set(personalized.formulaAssessment.claims.map((claim) => claim.id));
  for (const field of ["goalMatchClaimIds", "precautionClaimIds", "restrictionClaimIds", "unknownClaimIds"]) {
    for (const id of personalized.formulaAssessment.personalFit[field]) assert.ok(claimIds.has(id), `${field}: ${id}`);
  }
});

test("C11: formula personal claims never establish safety or application advice", () => {
  const result = analyzeComposition({
    text: "Aqua, Glycerin",
    formulaScope: "full",
    profile: completeProfile,
    productEvidence: {
      identificationStatus: "confirmed",
      name: "Face cream",
      category: "Face cream",
      source: { name: "Official brand", type: "official_brand_page", url: "https://example.test/cream" }
    }
  });
  assert.equal(result.personalization.version, PERSONALIZATION_VERSION);
  assert.equal(result.formulaAssessment.personalFit.safetyEstablished, false);
  assert.equal(result.formulaAssessment.personalFit.applicationAdviceAllowed, false);
  assert.doesNotMatch(result.personalization.summary, /безопасен|гарантирован|лечит/i);
});

test("C11: personal data remains session-only and is not eligible for history", () => {
  const result = analyzeComposition({ text: "Aqua, Glycerin", formulaScope: "full", profile: completeProfile });
  assert.equal(result.historyPolicy.mode, "session_only");
  assert.equal(result.personalization.profileProvenance, "request_session_only");
  assert.equal(isSessionOnlyHistory({ analysis: result }), true);
  assert.equal(isSessionOnlyHistory({ analysis: analyzeComposition({ text: "Aqua, Glycerin" }) }), false);
});

test("C11: unsupported profile fields do not change the result", () => {
  const base = directPersonalization(completeProfile);
  const ignored = directPersonalization({ ...completeProfile, favouriteColor: "green", desiredScore: 10 });
  assert.deepEqual(ignored, base);
});
