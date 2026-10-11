import { createHash } from "node:crypto";

export const KNOWLEDGE_SCHEMA_VERSION = "2.0";
export const SOURCE_POLICY = Object.freeze({
  primary_study_abstract: { scopes: ["abstract_only"], conclusions: ["literature_observation"] },
  study: { scopes: ["full_text"], conclusions: ["literature_observation", "technical_property"] },
  review: { scopes: ["full_text"], conclusions: ["literature_observation", "technical_property"] },
  regulatory_document: { scopes: ["full_text", "relevant_section"], conclusions: ["regulatory_restriction"] },
  technical_document: { scopes: ["full_text", "relevant_section"], conclusions: ["technical_property"] },
  product_test: { scopes: ["full_report"], conclusions: ["product_test_result"] },
  ingredient_reference: { scopes: ["record"], conclusions: ["ingredient_identity", "reference_function"] },
  manufacturer_page: { scopes: ["product_page"], conclusions: ["manufacturer_declaration"] },
  package_label: { scopes: ["label"], conclusions: ["manufacturer_declaration"] },
  third_party_catalog: { scopes: ["record"], conclusions: ["catalog_report"] }
});
const nonEmpty = (value) => typeof value === "string" && Boolean(value.trim());
const object = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const strings = (value) => Array.isArray(value) && value.every(nonEmpty);
const date = (value) => nonEmpty(value) && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const digest = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map((name) => [name, stable(value[name])])) : value;
const hashValue = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const artifact = (value) => nonEmpty(value) && /^(?:https:\/\/|artifacts\/|reviews\/)/.test(value);
const unknown = (value) => value == null || value === "" || ["unknown", "not_assessed", "unverified"].includes(value);

export function claimRevisionSnapshot(claim) {
  const { review, versionHistory, ...snapshot } = structuredClone(claim);
  return snapshot;
}

export function claimRevisionHash(claim) {
  return digest(claimRevisionSnapshot(claim));
}

export function reviewContentHash(claim, sources) {
  return digest({ claim: claimRevisionSnapshot(claim), sources: claim.basis.map((ref) => sources.find((source) => source?.id === ref?.sourceId) || null) });
}

const validSubject = (subject) => object(subject) && ["substance", "studied_formula", "finished_product"].includes(subject.kind)
  && nonEmpty(subject.id) && (subject.kind === "substance" ? subject.formulaVersion === null
    : subject.kind === "studied_formula" ? subject.formulaVersion === null || nonEmpty(subject.formulaVersion) : nonEmpty(subject.formulaVersion));
const sameSubject = (left, right) => left?.kind === right?.kind && left?.id === right?.id && left?.formulaVersion === right?.formulaVersion;

function validCondition(field, value) {
  if (field === "applicationSite") return ["skin", "face", "body", "hair", "lips", "scalp"].includes(value);
  if (field === "usage") return ["leave_on", "rinse_off"].includes(value);
  if (["productForm", "productType", "jurisdiction", "regulatoryVersion"].includes(field)) return nonEmpty(value) && !unknown(value);
  if (field === "concentrationPercent") return typeof value === "number" ? Number.isFinite(value) && value > 0 && value <= 100
    : object(value) && Object.keys(value).every((name) => ["min", "max"].includes(name))
      && Number.isFinite(value.min) && Number.isFinite(value.max) && value.min >= 0 && value.max <= 100 && value.min <= value.max;
  return false;
}

export function validateKnowledge(data, canonicalNames) {
  const errors = [];
  const modern = data?.schemaVersion === KNOWLEDGE_SCHEMA_VERSION;
  if ((!modern && data?.schemaVersion !== "1.1") || !nonEmpty(data?.version)) errors.push("Invalid knowledge version");
  if (!Array.isArray(data?.sources) || !Array.isArray(data?.claims)) return [...errors, "sources and claims must be arrays"];
  const sources = new Map();
  for (const source of data.sources) {
    if (!object(source)) { errors.push("Invalid source record"); continue; }
    if (!nonEmpty(source.id) || sources.has(source.id)) errors.push("Duplicate/missing source id");
    sources.set(source.id, source);
    const policy = SOURCE_POLICY[source.type];
    if ((!/^https:\/\//.test(source.url || "") && !(modern && artifact(source.artifactRef)))
      || !nonEmpty(source.title) || !date(source.checkedAt) || !nonEmpty(source.context)
      || !policy?.scopes?.includes(source.checkedScope)
      || (!modern && source.type !== "primary_study_abstract")) errors.push(`Invalid source ${source.id}`);
    if (!modern) continue;
    if ((source.version !== null && !nonEmpty(source.version)) || !validSubject(source.subject)) errors.push(`${source.id}: source version/subject required`);
    for (const field of ["retrievedAt", "publishedAt"]) if (source[field] !== null && !date(source[field])) errors.push(`${source.id}: invalid ${field}`);
    if (source.contentHash !== null && !hashValue(source.contentHash)) errors.push(`${source.id}: invalid contentHash`);
    if (!object(source.conditions)) errors.push(`${source.id}: source conditions required`);
    for (const [field, value] of Object.entries(source.conditions || {})) if (!validCondition(field, value)) errors.push(`${source.id}: invalid source condition ${field}`);
    if (source.type === "regulatory_document") {
      const r = source.regulation;
      if (!object(r) || !nonEmpty(r.jurisdiction) || !nonEmpty(r.version) || !date(r.effectiveFrom)
        || (r.effectiveTo !== null && (!date(r.effectiveTo) || r.effectiveTo < r.effectiveFrom))) errors.push(`${source.id}: regulation jurisdiction/version/dates required`);
    }
    if (source.type === "product_test" && (source.subject?.kind !== "finished_product" || !nonEmpty(source.method))) errors.push(`${source.id}: product test requires exact product version and method`);
  }
  const reviewers = new Map();
  if (modern && !Array.isArray(data.reviewers)) errors.push("reviewers must be an array");
  for (const reviewer of Array.isArray(data.reviewers) ? data.reviewers : []) {
    if (!object(reviewer)) { errors.push("Invalid reviewer"); continue; }
    if (!nonEmpty(reviewer.id) || reviewers.has(reviewer.id) || reviewer.kind !== "human" || !nonEmpty(reviewer.name)
      || !nonEmpty(reviewer.qualification) || !nonEmpty(reviewer.verification?.verifiedBy)
      || !date(reviewer.verification?.verifiedAt) || !artifact(reviewer.verification?.artifactRef)) errors.push("Reviewer requires documented human identity/qualification verification");
    reviewers.set(reviewer.id, reviewer);
  }
  const ids = new Set();
  for (const claim of data.claims) {
    if (!object(claim)) { errors.push("Invalid claim record"); continue; }
    const prefix = claim.ruleId || "claim";
    if (!nonEmpty(claim.ruleId) || ids.has(claim.ruleId)) errors.push("Duplicate/missing ruleId");
    ids.add(claim.ruleId);
    for (const field of ["version", "ingredient", "role", "possibleContribution"]) if (!nonEmpty(claim[field])) errors.push(`${prefix}: missing ${field}`);
    if (!canonicalNames.has(String(claim.ingredient || "").trim().toUpperCase())) errors.push(`${prefix}: unknown canonical ingredient`);
    if (!date(claim.checkedAt)) errors.push(`${prefix}: missing check date`);
    if (!["verified", "review_required", "insufficient_data"].includes(claim.evidenceStatus)) errors.push(`${prefix}: invalid evidence status`);
    if (!strings(claim.limitations) || !claim.limitations.length) errors.push(`${prefix}: limitations required`);
    if (!Array.isArray(claim.basis) || !claim.basis.length || !claim.basis.every((ref) => sources.has(ref?.sourceId) && nonEmpty(ref?.locator))) errors.push(`${prefix}: unresolved basis`);
    const review = claim.review;
    if (!["pending", "approved", "rejected"].includes(review?.status)) errors.push(`${prefix}: invalid review`);
    if (review?.status === "approved" && (!nonEmpty(review.reviewer) || !date(review.reviewedAt))) errors.push(`${prefix}: approval requires reviewer and date`);
    if (review?.status === "approved" && claim.evidenceStatus !== "verified") errors.push(`${prefix}: approved claim must be verified`);
    if (review?.status === "pending" && claim.evidenceStatus !== "review_required") errors.push(`${prefix}: pending claim must require review`);
    const risk = claim.riskAssessment;
    if (!object(risk) || !["assessed", "insufficient_data"].includes(risk.status) || !strings(risk.statements)
      || !strings(risk.limitations) || !risk.limitations.length) errors.push(`${prefix}: risk assessment is incomplete`);
    if (!object(claim.conditions) || !Object.keys(claim.conditions).length) errors.push(`${prefix}: conditions required`);
    for (const [field, value] of Object.entries(claim.conditions || {})) if (!validCondition(field, value)) errors.push(`${prefix}: unsupported condition ${field}`);
    if (!modern) continue;
    if (!validSubject(claim.subject)) errors.push(`${prefix}: valid subject required`);
    if (!strings(claim.unknownReasons)) errors.push(`${prefix}: unknownReasons required`);
    if (claim.evidenceStatus === "insufficient_data" && !claim.unknownReasons?.length) errors.push(`${prefix}: insufficient_data requires an unknown reason`);
    if (["ingredient_identity", "reference_function", "technical_property", "regulatory_restriction"].includes(claim.conclusionType)
      && (claim.subject?.kind !== "substance" || String(claim.subject?.id).toUpperCase() !== String(claim.ingredient).toUpperCase())) errors.push(`${prefix}: ingredient conclusion requires substance identity`);
    if (claim.conclusionType === "product_test_result" && claim.subject?.kind !== "finished_product") errors.push(`${prefix}: product result requires finished_product`);
    for (const ref of Array.isArray(claim.basis) ? claim.basis : []) {
      const source = sources.get(ref?.sourceId);
      if (!SOURCE_POLICY[source?.type]?.conclusions?.includes(claim.conclusionType)) errors.push(`${prefix}: source cannot support conclusion type`);
      if (!sameSubject(source?.subject, claim.subject)) errors.push(`${prefix}: source and conclusion subjects differ`);
      for (const [field, expected] of Object.entries(source?.conditions || {})) {
        const actual = claim.conditions?.[field];
        const sourceRange = field === "concentrationPercent" && object(expected);
        const narrowed = sourceRange && (typeof actual === "number" ? actual >= expected.min && actual <= expected.max
          : object(actual) && actual.min >= expected.min && actual.max <= expected.max);
        if (!narrowed && JSON.stringify(stable(actual)) !== JSON.stringify(stable(expected))) errors.push(`${prefix}: source condition broadened or missing: ${field}`);
      }
      if (risk?.status === "assessed" && !["study", "review", "product_test"].includes(source?.type)) errors.push(`${prefix}: source cannot support assessed risk`);
      if (source?.type === "regulatory_document" && (claim.conditions?.jurisdiction !== source.regulation?.jurisdiction
        || claim.conditions?.regulatoryVersion !== source.regulation?.version)) errors.push(`${prefix}: regulation context must match source`);
    }
    const lifecycle = claim.lifecycle;
    if (!["active", "withdrawn", "superseded"].includes(lifecycle?.status) || !date(lifecycle?.changedAt)) errors.push(`${prefix}: lifecycle required`);
    if (lifecycle?.status !== "active" && !nonEmpty(lifecycle?.reason)) errors.push(`${prefix}: inactive rule needs reason`);
    if (lifecycle?.status === "superseded" && (!nonEmpty(lifecycle.replacedBy) || lifecycle.replacedBy === claim.ruleId
      || !data.claims.some((next) => next?.ruleId === lifecycle.replacedBy && next?.lifecycle?.status === "active"))) errors.push(`${prefix}: active replacement required`);
    const history = claim.versionHistory;
    if (!Array.isArray(history) || !history.length) errors.push(`${prefix}: version history required`);
    else {
      const versions = new Set();
      history.forEach((entry, index) => {
        if (!object(entry) || !nonEmpty(entry.version) || versions.has(entry.version) || !date(entry.changedAt) || !nonEmpty(entry.change)
          || !object(entry.snapshot) || entry.snapshot?.ruleId !== claim.ruleId || entry.snapshot?.version !== entry.version
          || digest(entry.snapshot) !== entry.contentHash || entry.previousHash !== (index ? history[index - 1]?.contentHash : null)
          || (index > 0 && entry.changedAt < history[index - 1]?.changedAt)) errors.push(`${prefix}: invalid version history`);
        versions.add(entry?.version);
      });
      if (history.at(-1)?.contentHash !== claimRevisionHash(claim) || history.at(-1)?.version !== claim.version) errors.push(`${prefix}: current revision differs from history`);
    }
    if (review?.status === "approved") {
      if (!reviewers.has(review.reviewerId) || reviewers.get(review.reviewerId)?.name !== review.reviewer
        || !artifact(review.artifactRef) || review.claimVersion !== claim.version || !Array.isArray(claim.basis)
        || review.contentHash !== reviewContentHash(claim, data.sources)) errors.push(`${prefix}: approval requires registered human, signoff artifact and matching content hash`);
      if ((Array.isArray(claim.basis) ? claim.basis : []).some((ref) => {
        const source = sources.get(ref?.sourceId);
        return !hashValue(source?.contentHash) && !artifact(source?.artifactRef);
      })) errors.push(`${prefix}: approval requires captured source content or artifact`);
    }
  }
  return errors;
}

export function matchConditions(conditions, context = {}) {
  const missing = [];
  const conflicts = [];
  for (const [field, expected] of Object.entries(conditions || {})) {
    const actual = context[field];
    if (unknown(actual) || (field === "concentrationPercent" && (typeof actual !== "number" || !Number.isFinite(actual) || actual < 0 || actual > 100))) missing.push(field);
    else if (field === "concentrationPercent" && object(expected)) {
      if (actual < expected.min || actual > expected.max) conflicts.push(field);
    } else if (!(field === "applicationSite" && expected === "skin" && ["face", "body"].includes(actual)) && actual !== expected) conflicts.push(field);
  }
  return { status: conflicts.length ? "not_applicable" : missing.length ? "conditional" : "context_matches", missing, conflicts };
}

export function evaluateClaimContext(claim, context, dataset) {
  if (dataset.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION) {
    const match = matchConditions(claim.conditions, context);
    return { ...match, status: match.status === "not_applicable" ? match.status : "conditional",
      unknownReasons: ["legacy_rule_requires_migration"], conclusionSupported: false };
  }
  const effective = { ...context };
  if (Object.hasOwn(claim.conditions, "concentrationPercent")) {
    const quantity = context.concentrations?.[claim.ingredient];
    effective.concentrationPercent = quantity?.subjectKind === "substance" && quantity?.subjectId === claim.ingredient
      && quantity?.unit === "percent" && quantity?.verification === "source_checked" && nonEmpty(quantity?.sourceId) ? quantity.value : null;
  }
  const applicability = matchConditions(claim.conditions, effective);
  if (claim.subject.kind !== "substance") {
    for (const [field, expected] of [["formulaId", claim.subject.id], ["formulaVersion", claim.subject.formulaVersion]]) {
      if (unknown(expected) || unknown(context[field])) applicability.missing.push(field);
      else if (context[field] !== expected) applicability.conflicts.push(field);
    }
  }
  for (const ref of claim.basis) {
    const regulation = dataset.sources.find((source) => source.id === ref.sourceId)?.regulation;
    if (!regulation) continue;
    if (!date(context.assessmentDate)) applicability.missing.push("assessmentDate");
    else if (context.assessmentDate < regulation.effectiveFrom || (regulation.effectiveTo && context.assessmentDate > regulation.effectiveTo)) applicability.conflicts.push("assessmentDate");
  }
  applicability.missing = [...new Set(applicability.missing)];
  applicability.conflicts = [...new Set(applicability.conflicts)];
  applicability.status = applicability.conflicts.length ? "not_applicable" : applicability.missing.length ? "conditional" : "context_matches";
  if (claim.unknownReasons.length && applicability.status === "context_matches") applicability.status = "conditional";
  const unknownReasons = [...claim.unknownReasons, ...applicability.missing.map((field) => `missing:${field}`), ...applicability.conflicts.map((field) => `conflict:${field}`)];
  if (claim.review.status !== "approved") unknownReasons.push("domain_review_pending");
  return { ...applicability, unknownReasons, conclusionSupported: applicability.status === "context_matches"
    && !unknownReasons.length && claim.review.status === "approved" && claim.evidenceStatus === "verified" && claim.lifecycle.status === "active" };
}
