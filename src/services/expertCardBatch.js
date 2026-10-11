export const EXPERT_CARD_BATCH_SCHEMA_VERSION = "1.0";

export const REQUIRED_FUNCTIONAL_CLASSES = Object.freeze([
  "emulsifiers",
  "emollients",
  "surfactants",
  "preservatives",
  "fragrance",
  "fatty_phase_oils",
  "uv_filters",
  "actives_additives",
  "humectants",
  "rheology"
]);

const nonEmpty = (value) => typeof value === "string" && Boolean(value.trim());
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const uniqueText = (value) => Array.isArray(value)
  && value.every(nonEmpty)
  && new Set(value.map((item) => item.trim().toLocaleLowerCase("en-US"))).size === value.length;

function validateSource(source, errors, index) {
  const prefix = `sources[${index}]`;
  if (!isObject(source)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  if (!nonEmpty(source.id)) errors.push(`${prefix}.id is required`);
  if (!nonEmpty(source.title)) errors.push(`${prefix}.title is required`);
  if (!nonEmpty(source.type)) errors.push(`${prefix}.type is required`);
  if (!nonEmpty(source.checkedAt) || Number.isNaN(Date.parse(source.checkedAt))) errors.push(`${prefix}.checkedAt must be a date`);
  if (!nonEmpty(source.scope)) errors.push(`${prefix}.scope is required`);
  if (source.url !== null && !/^https:\/\//u.test(source.url || "")) errors.push(`${prefix}.url must be https or null`);
  if (source.artifactRef !== null && !nonEmpty(source.artifactRef)) errors.push(`${prefix}.artifactRef must be text or null`);
  if (source.contentHash !== null && !/^[a-f0-9]{64}$/u.test(source.contentHash || "")) errors.push(`${prefix}.contentHash must be sha256 or null`);
}

function validateCard(card, sourceIds, errors, index) {
  const prefix = `cards[${index}]`;
  if (!isObject(card)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  if (!nonEmpty(card.id)) errors.push(`${prefix}.id is required`);
  if (!isObject(card.ingredient) || !nonEmpty(card.ingredient.canonicalName)) errors.push(`${prefix}.ingredient.canonicalName is required`);
  if (!uniqueText(card.ingredient?.aliases || [])) errors.push(`${prefix}.ingredient.aliases must be unique text`);
  if (!uniqueText(card.ingredient?.referenceFunctions || [])) errors.push(`${prefix}.ingredient.referenceFunctions must be unique text`);
  if (!isObject(card.corpusPriority) || card.corpusPriority.partition !== "setup") errors.push(`${prefix}.corpusPriority must use setup only`);
  if (card.corpusPriority?.candidateMaterialKind !== "external_catalog_transcription_not_gold") {
    errors.push(`${prefix}.corpusPriority must identify candidate material as not gold`);
  }
  if (!Number.isInteger(card.corpusPriority?.rank) || card.corpusPriority.rank < 1) errors.push(`${prefix}.corpusPriority.rank is invalid`);
  if (!Number.isInteger(card.corpusPriority?.formulaCount) || card.corpusPriority.formulaCount < 1) errors.push(`${prefix}.corpusPriority.formulaCount is invalid`);
  if (!uniqueText(card.functionalClasses || [])) errors.push(`${prefix}.functionalClasses must be unique text`);
  if (!card.functionalClasses?.every((value) => REQUIRED_FUNCTIONAL_CLASSES.includes(value))) errors.push(`${prefix}.functionalClasses contains an unsupported value`);
  if (!uniqueText(card.selectionReasons || [])) errors.push(`${prefix}.selectionReasons must be unique text`);

  const draft = card.draftReference;
  if (!isObject(draft)) errors.push(`${prefix}.draftReference is required`);
  else {
    if (draft.claimType !== "reference_function_candidate") errors.push(`${prefix}.draftReference.claimType is invalid`);
    if (!nonEmpty(draft.textRu)) errors.push(`${prefix}.draftReference.textRu is required`);
    if (draft.evidenceStatus !== "review_required") errors.push(`${prefix}.draftReference must remain review_required`);
    if (draft.publicationStatus !== "staged_not_runtime") errors.push(`${prefix}.draftReference must remain staged_not_runtime`);
    if (draft.runtimeEligible !== false) errors.push(`${prefix}.draftReference.runtimeEligible must be false`);
    if (!isObject(draft.basis) || !sourceIds.has(draft.basis.sourceId) || !nonEmpty(draft.basis.locator)) {
      errors.push(`${prefix}.draftReference.basis must reference an exact source locator`);
    }
    if (!uniqueText(draft.limitations || []) || draft.limitations.length < 2) errors.push(`${prefix}.draftReference.limitations must state boundaries`);
    if (!isObject(draft.review) || draft.review.status !== "pending" || draft.review.reviewerId !== null || draft.review.reviewedAt !== null) {
      errors.push(`${prefix}.draftReference.review must remain pending without a reviewer`);
    }
  }

  if (!isObject(card.assessmentGaps)) errors.push(`${prefix}.assessmentGaps is required`);
  else {
    for (const field of ["technicalProperties", "formulaRole", "tolerability", "regulatoryRestrictions", "qualityAssessment"]) {
      if (card.assessmentGaps[field] !== "not_assessed") errors.push(`${prefix}.assessmentGaps.${field} must be not_assessed`);
    }
  }
  if (!Array.isArray(card.researchCandidates)) errors.push(`${prefix}.researchCandidates must be an array`);
  else for (const [candidateIndex, candidate] of card.researchCandidates.entries()) {
    if (!sourceIds.has(candidate.sourceId)) errors.push(`${prefix}.researchCandidates[${candidateIndex}] references an unknown source`);
    if (candidate.status !== "candidate_not_transcribed") errors.push(`${prefix}.researchCandidates[${candidateIndex}] must remain untranscribed`);
  }

  for (const forbidden of ["quality_score", "qualityScore", "benefits", "risks", "best_for", "avoid_for"]) {
    if (Object.hasOwn(card, forbidden)) errors.push(`${prefix}.${forbidden} is not allowed in the C06 staging batch`);
  }
}

export function validateExpertCardBatch(document, { expectedCardCount = null } = {}) {
  const errors = [];
  if (!isObject(document)) return ["batch must be an object"];
  if (document.schemaVersion !== EXPERT_CARD_BATCH_SCHEMA_VERSION) errors.push("unsupported schemaVersion");
  if (!nonEmpty(document.batchId)) errors.push("batchId is required");
  if (!nonEmpty(document.checkedAt) || Number.isNaN(Date.parse(document.checkedAt))) errors.push("checkedAt must be a date");
  if (document.publicationStatus !== "staged_not_runtime") errors.push("publicationStatus must be staged_not_runtime");
  if (document.domainReviewStatus !== "pending_external_expert") errors.push("domainReviewStatus must remain pending_external_expert");
  if (!isObject(document.selectionPolicy) || document.selectionPolicy.selectionPartition !== "setup") {
    errors.push("selectionPolicy.selectionPartition must be setup");
  }
  if (!Array.isArray(document.sources)) errors.push("sources must be an array");
  const sourceIds = new Set();
  for (const [index, source] of (document.sources || []).entries()) {
    validateSource(source, errors, index);
    if (sourceIds.has(source?.id)) errors.push(`sources[${index}].id duplicates another source`);
    sourceIds.add(source?.id);
  }
  if (!Array.isArray(document.cards)) errors.push("cards must be an array");
  if (expectedCardCount !== null && document.cards?.length !== expectedCardCount) errors.push(`cards must contain ${expectedCardCount} records`);
  const cardIds = new Set();
  const ingredientNames = new Set();
  for (const [index, card] of (document.cards || []).entries()) {
    validateCard(card, sourceIds, errors, index);
    const id = card?.id;
    const ingredient = card?.ingredient?.canonicalName?.trim().toLocaleLowerCase("en-US");
    if (cardIds.has(id)) errors.push(`cards[${index}].id duplicates another card`);
    if (ingredientNames.has(ingredient)) errors.push(`cards[${index}].ingredient duplicates another card`);
    cardIds.add(id);
    ingredientNames.add(ingredient);
  }
  const represented = new Set((document.cards || []).flatMap((card) => card.functionalClasses || []));
  for (const required of REQUIRED_FUNCTIONAL_CLASSES) {
    if (!represented.has(required)) errors.push(`required functional class is missing: ${required}`);
  }
  if ((document.cards || []).some((card) => card.draftReference?.review?.status === "approved" || card.draftReference?.evidenceStatus === "verified")) {
    errors.push("C06 staging batch cannot contain approved or verified claims without external expert review");
  }
  return errors;
}

export function summarizeExpertCardBatch(document) {
  const classCounts = Object.fromEntries(REQUIRED_FUNCTIONAL_CLASSES.map((name) => [name, 0]));
  for (const card of document.cards || []) {
    for (const name of card.functionalClasses || []) classCounts[name] = (classCounts[name] || 0) + 1;
  }
  return {
    cardCount: document.cards?.length || 0,
    stagedCount: (document.cards || []).filter((card) => card.draftReference?.publicationStatus === "staged_not_runtime").length,
    approvedCount: (document.cards || []).filter((card) => card.draftReference?.review?.status === "approved").length,
    classCounts
  };
}
