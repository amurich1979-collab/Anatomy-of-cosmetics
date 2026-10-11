import { createHash } from "node:crypto";
import fs from "node:fs";

export const PERSONAL_FIT_EVIDENCE_VERSION = "1.0.0";

const policyText = fs.readFileSync(new URL("../../docs/C11_PERSONALIZATION_RULES.md", import.meta.url), "utf8");
const policyHash = createHash("sha256").update(policyText).digest("hex");
const key = (value) => String(value || "").normalize("NFKC").trim().toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ");
const shortHash = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
const unique = (values) => [...new Set(values.filter(Boolean))];

function addUnique(collection, item) {
  if (!collection.some((existing) => existing.id === item.id)) collection.push(item);
}

function policySource() {
  return {
    id: "source:c11-policy",
    type: "technical_document",
    url: null,
    artifactRef: "docs/C11_PERSONALIZATION_RULES.md",
    title: "C11. Правила персональной интерпретации",
    locator: `version ${PERSONAL_FIT_EVIDENCE_VERSION}`,
    checkedAt: "2026-10-05",
    retrievedAt: null,
    publishedAt: "2026-10-05",
    jurisdiction: null,
    productVersion: null,
    checkedScope: "engineering_policy_not_medical_guideline",
    contentHash: policyHash,
    review: { status: "engineering_review_only" }
  };
}

function ingredientRefs(assessment, item) {
  const names = [item.ingredient, item.input, ...(item.ingredients || [])].map(key).filter(Boolean);
  return (assessment.ingredients || [])
    .filter((ingredient) => names.includes(key(ingredient.canonicalName || ingredient.input)))
    .map((ingredient) => ingredient.id);
}

function itemClaim(assessment, item, kind) {
  const refs = ingredientRefs(assessment, item);
  const id = `claim:personal:${kind}:${shortHash(`${item.ruleId}|${item.text}|${refs.join("|")}`)}`;
  const verification = item.ruleId === "personal.allergen-match"
    ? "user_reported_and_formula_matched"
    : item.ruleId === "personal.non-cosmetic"
      ? "derived_safety_guard"
      : item.ruleId === "personal.area-mismatch"
        ? "source_and_user_context"
        : "user_reported_or_guarded";
  return {
    id,
    subject: "personal_fit",
    kind,
    text: item.text,
    verification,
    basis: [{
      sourceId: "source:c11-policy",
      locator: `rule=${item.ruleId}`,
      ruleId: item.ruleId,
      ruleVersion: PERSONAL_FIT_EVIDENCE_VERSION,
      inputRefs: refs
    }],
    scope: { profileFields: item.fields || [] },
    limitations: ["Это инженерная персональная интерпретация, а не диагноз или схема лечения."],
    missingInputs: [],
    review: null
  };
}

function relatedExpertBasis(assessment, goal) {
  const ruleIds = new Set(goal.expertRuleIds || []);
  return (assessment.claims || [])
    .filter((claim) => (claim.basis || []).some((basis) => ruleIds.has(basis.ruleId)))
    .flatMap((claim) => claim.basis || []);
}

function goalClaim(assessment, goal) {
  const refs = ingredientRefs(assessment, goal);
  const id = `claim:personal:goal:${shortHash(`${goal.goal}|${goal.evidenceStatus}|${goal.text}|${refs.join("|")}`)}`;
  const expertBasis = goal.evidenceStatus === "potential_match" ? relatedExpertBasis(assessment, goal) : [];
  return {
    id,
    subject: "personal_fit",
    kind: goal.evidenceStatus === "potential_match" ? "interpretation" : goal.evidenceStatus === "reference_only" ? "reference" : "unknown",
    text: goal.text,
    verification: goal.evidenceStatus === "potential_match" ? "expert_reviewed" : goal.evidenceStatus === "reference_only" ? "reference_only" : "unverified",
    basis: [
      { sourceId: "source:c11-policy", locator: `goal=${goal.goal}`, ruleId: `C11.goal.${goal.goal}`, ruleVersion: PERSONAL_FIT_EVIDENCE_VERSION, inputRefs: refs },
      ...expertBasis
    ],
    scope: { goal: goal.goal, applicationStatus: goal.applicationStatus },
    limitations: ["Соответствие цели не подтверждает безопасность, переносимость или эффект готового продукта."],
    missingInputs: goal.missingInputs || [],
    review: null
  };
}

function mappedStatus(status) {
  return {
    blocked: "restricted",
    review_required: "caution",
    potential_fit: "potential_fit",
    insufficient_data: "insufficient_data",
    general_only: "general_only"
  }[status] || "general_only";
}

export function applyPersonalFitEvidence({ assessment, personalization } = {}) {
  const result = structuredClone(assessment);
  if (!personalization?.profileProvided) {
    result.personalFit = {
      status: "general_only",
      goalMatchClaimIds: [],
      precautionClaimIds: [],
      restrictionClaimIds: [],
      unknownClaimIds: [],
      missingInputs: personalization?.missingFields || [],
      missingInputsByConclusion: personalization?.missingInputsByConclusion || [],
      usedProfileFields: [],
      safetyEstablished: false,
      applicationAdviceAllowed: false
    };
    result.versions = { ...(result.versions || {}), personalFitEvidence: PERSONAL_FIT_EVIDENCE_VERSION };
    return result;
  }

  addUnique(result.sources, policySource());
  const restrictionClaimIds = [];
  const precautionClaimIds = [];
  const goalMatchClaimIds = [];
  const unknownClaimIds = [];

  for (const item of personalization.restrictions || []) {
    const claim = itemClaim(result, item, "restriction");
    addUnique(result.claims, claim);
    restrictionClaimIds.push(claim.id);
  }
  for (const item of personalization.precautions || []) {
    const claim = itemClaim(result, item, "precaution");
    addUnique(result.claims, claim);
    precautionClaimIds.push(claim.id);
  }
  for (const goal of personalization.goalAssessments || []) {
    const claim = goalClaim(result, goal);
    addUnique(result.claims, claim);
    if (goal.evidenceStatus === "insufficient_data") unknownClaimIds.push(claim.id);
    else goalMatchClaimIds.push(claim.id);
  }

  result.personalFit = {
    status: mappedStatus(personalization.status),
    goalMatchClaimIds: unique(goalMatchClaimIds).sort(),
    precautionClaimIds: unique(precautionClaimIds).sort(),
    restrictionClaimIds: unique(restrictionClaimIds).sort(),
    unknownClaimIds: unique(unknownClaimIds).sort(),
    missingInputs: unique((personalization.missingInputsByConclusion || []).flatMap((item) => item.fields || [])).sort(),
    missingInputsByConclusion: structuredClone(personalization.missingInputsByConclusion || []),
    usedProfileFields: unique((personalization.usedInputs || []).map((item) => item.field)).sort(),
    safetyEstablished: false,
    applicationAdviceAllowed: false
  };
  result.claims.sort((left, right) => left.id.localeCompare(right.id));
  result.sources.sort((left, right) => left.id.localeCompare(right.id));
  result.versions = { ...(result.versions || {}), personalFitEvidence: PERSONAL_FIT_EVIDENCE_VERSION };
  return result;
}

export function getPersonalFitPolicyInfo() {
  return { version: PERSONAL_FIT_EVIDENCE_VERSION, sha256: policyHash };
}
