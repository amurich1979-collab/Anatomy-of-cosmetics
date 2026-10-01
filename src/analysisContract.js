export const ANALYSIS_CONTRACT_VERSION = "1.0";
export const ANALYSIS_ALGORITHM_VERSION = "analyzer-v5-personal-context";

const FORMULA_SCOPES = new Set(["full", "active_only", "partial", "unknown"]);
const MATCH_STATUSES = new Set(["confirmed", "suggested", "unknown"]);
const IDENTIFICATION_STATUSES = new Set(["confirmed", "suggested", "unknown"]);
const METRIC_STATUSES = new Set(["measured", "not_measured"]);
const ASSESSMENT_STATUSES = new Set(["assessed", "not_assessed"]);
const PURPOSE_STATUSES = new Set(["confirmed_manufacturer", "source_backed", "hypothesis", "uncertain", "safety_flag"]);
const AMBIGUOUS_MATCH_METHODS = new Set(["suggested", "fuzzy"]);

function textOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function dateOrNull(value) {
  const text = textOrNull(value);
  if (!text || Number.isNaN(Date.parse(text))) return null;
  return text;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function cloneJson(value, fallback = {}) {
  if (value == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return cloneJson(value, {});
}

export function normalizeFormulaScope(value) {
  const scope = String(value || "").trim().toLowerCase();
  if (scope === "active_ingredients_only") return "active_only";
  return FORMULA_SCOPES.has(scope) ? scope : "unknown";
}

function normalizeIdentificationStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return IDENTIFICATION_STATUSES.has(status) ? status : "unknown";
}

function normalizeSource(value = {}) {
  return {
    name: textOrNull(value?.name),
    type: textOrNull(value?.type),
    url: textOrNull(value?.url),
    retrievedAt: dateOrNull(value?.retrievedAt)
  };
}

function normalizeMetric(value) {
  const measuredValue = numberOrNull(value?.value);
  if (measuredValue == null) {
    return { value: null, status: "not_measured", method: null };
  }

  return {
    value: measuredValue,
    status: "measured",
    method: textOrNull(value?.method)
  };
}

function normalizeAssessment(value) {
  const status = String(value?.status || "").trim().toLowerCase();
  if (status === "assessed") return { status, reason: null };

  return {
    status: "not_assessed",
    reason: textOrNull(value?.reason) || "insufficient_data"
  };
}

function normalizePurpose(value = {}) {
  const status = PURPOSE_STATUSES.has(value?.purposeStatus) ? value.purposeStatus : "uncertain";
  return {
    type: textOrNull(value?.type) || "unknown_cosmetic",
    label: textOrNull(value?.label) || "назначение не подтверждено",
    status,
    source: normalizeSource(value?.purposeEvidence?.source),
    instruction: {
      text: textOrNull(value?.application),
      status: textOrNull(value?.applicationEvidence?.status) || "unavailable",
      source: normalizeSource(value?.applicationEvidence?.source)
    },
    format: cloneJson(value?.format, { value: null, status: "unknown", source: null }),
    applicationArea: cloneJson(value?.applicationArea, { value: null, status: "unknown", source: null }),
    exposure: cloneJson(value?.exposure, { mode: "unknown", status: "unknown", source: null })
  };
}

function matchOrigin(item) {
  if (item?.excludedFromScoring || item?.category === "proprietary_complex") return "proprietary_complex";
  const source = String(item?.dataSource || "").toLowerCase();
  if (source.includes("cosing")) return "cosing";
  if (source) return source.replace(/[^a-z0-9_-]+/g, "_");
  return "expert";
}

function matchMethod(item) {
  const method = String(item?.match_type || "").trim().toLowerCase();
  if (method) return method;
  return item?.excludedFromScoring ? "undisclosed" : "exact";
}

function ingredientStatus(item, method) {
  if (item?.excludedFromScoring || item?.category === "proprietary_complex") return "unknown";
  if (item?.status === "suggested" || item?.status === "unknown") return item.status;
  if (AMBIGUOUS_MATCH_METHODS.has(method)) return "suggested";
  return "confirmed";
}

function findInputCorrection(analysis, input) {
  const normalizedInput = String(input || "").trim().toLowerCase();
  const correction = analysis?.inciCleaning?.autoCorrections?.find((item) => (
    String(item?.corrected || "").trim().toLowerCase() === normalizedInput
  ));
  if (!correction) return null;

  return {
    original: textOrNull(correction.original),
    method: textOrNull(correction.source),
    stringSimilarity: numberOrNull(correction.confidence)
  };
}

function foundIngredientContract(item, analysis) {
  const method = matchMethod(item);
  const status = ingredientStatus(item, method);
  const candidateName = textOrNull(item?.suggested_match) || textOrNull(item?.name);

  return {
    input: textOrNull(item?.input),
    canonicalName: status === "confirmed" ? textOrNull(item?.name) : null,
    position: Number.isInteger(item?.position) && item.position > 0 ? item.position : null,
    provenance: item?.provenance || null,
    status,
    match: {
      origin: matchOrigin(item),
      method,
      suggestedName: status === "suggested" ? candidateName : null,
      stringSimilarity: numberOrNull(item?.match_confidence),
      inputCorrection: findInputCorrection(analysis, item?.input)
    }
  };
}

function unknownIngredientContract(item) {
  const suggestedName = textOrNull(item?.suggested_match);
  return {
    input: textOrNull(item?.input),
    canonicalName: null,
    position: Number.isInteger(item?.position) && item.position > 0 ? item.position : null,
    status: item?.status === "suggested" || suggestedName ? "suggested" : "unknown",
    provenance: item?.provenance || null,
    match: {
      origin: suggestedName ? "inci_registry" : "none",
      method: suggestedName ? "suggested" : "none",
      suggestedName,
      stringSimilarity: numberOrNull(item?.match_confidence),
      inputCorrection: null
    }
  };
}

function buildIngredients(analysis) {
  return [
    ...(analysis?.found || []).map((item) => foundIngredientContract(item, analysis)),
    ...(analysis?.unknown || []).map(unknownIngredientContract)
  ].sort((left, right) => (left.position || Number.MAX_SAFE_INTEGER) - (right.position || Number.MAX_SAFE_INTEGER));
}

function knowledgeCoverage(ingredients) {
  const total = ingredients.length;
  const confirmed = ingredients.filter((item) => item.status === "confirmed").length;
  const suggested = ingredients.filter((item) => item.status === "suggested").length;
  const unknown = ingredients.filter((item) => item.status === "unknown").length;

  return {
    value: total ? Number((confirmed / total).toFixed(4)) : null,
    status: total ? "measured" : "not_measured",
    confirmed,
    suggested,
    unknown,
    total
  };
}

export function createAnalysisContract({ analysis, request = {}, generatedAt = new Date().toISOString() }) {
  const evidence = request?.evidence || {};
  const productEvidence = evidence?.product || {};
  const formulaEvidence = evidence?.formula || {};
  const ingredients = buildIngredients(analysis);
  const productName = textOrNull(productEvidence?.name) || textOrNull(request?.productName);

  const contract = {
    schemaVersion: ANALYSIS_CONTRACT_VERSION,
    algorithmVersion: ANALYSIS_ALGORITHM_VERSION,
    evidenceVersions: cloneJson(analysis?.evidenceVersions, null),
    generatedAt: dateOrNull(generatedAt) || new Date().toISOString(),
    product: {
      identity: {
        id: textOrNull(productEvidence?.id),
        barcode: textOrNull(productEvidence?.barcode),
        brand: textOrNull(productEvidence?.brand),
        name: productName
      },
      identificationStatus: normalizeIdentificationStatus(productEvidence?.identificationStatus),
      source: normalizeSource(productEvidence?.source),
      purpose: normalizePurpose(analysis?.productSafety || analysis?.productClassification)
    },
    formula: {
      scope: normalizeFormulaScope(formulaEvidence?.scope),
      version: textOrNull(formulaEvidence?.version),
      market: textOrNull(formulaEvidence?.market),
      rawText: String(request?.text ?? ""),
      normalizedText: textOrNull(analysis?.inciCleaning?.cleanedText),
      source: normalizeSource(formulaEvidence?.source)
    },
    ingredients,
    metrics: {
      ocrReadability: normalizeMetric(evidence?.metrics?.ocrReadability),
      productIdentification: normalizeMetric(evidence?.metrics?.productIdentification),
      knowledgeCoverage: knowledgeCoverage(ingredients)
    },
    assessment: normalizeAssessment(analysis?.assessment),
    profile: normalizeProfile(analysis?.personalization?.profile || request?.profile),
    personalization: cloneJson(analysis?.personalization, null),
    historyPolicy: cloneJson(analysis?.historyPolicy, null)
  };

  const validation = validateAnalysisContract(contract);
  if (!validation.valid) {
    throw new TypeError(`Invalid analysis contract: ${validation.errors.join("; ")}`);
  }
  return contract;
}

export function validateAnalysisContract(contract) {
  const errors = [];
  if (!contract || typeof contract !== "object") return { valid: false, errors: ["contract must be an object"] };
  if (contract.schemaVersion !== ANALYSIS_CONTRACT_VERSION) errors.push("unsupported schemaVersion");
  if (!textOrNull(contract.algorithmVersion)) errors.push("algorithmVersion is required");
  if (contract.evidenceVersions != null) {
    if (!textOrNull(contract.evidenceVersions.rules) || !textOrNull(contract.evidenceVersions.knowledge)) errors.push("evidenceVersions requires rules and knowledge versions");
    for (const field of ["knowledgeSha256", "registrySha256"]) {
      if (!/^[a-f0-9]{64}$/.test(contract.evidenceVersions[field] || "")) errors.push(`evidenceVersions.${field} is invalid`);
    }
    if (contract.evidenceVersions.localAdditionsSha256 != null && !/^[a-f0-9]{64}$/.test(contract.evidenceVersions.localAdditionsSha256)) {
      errors.push("evidenceVersions.localAdditionsSha256 is invalid");
    }
  }
  if (!dateOrNull(contract.generatedAt)) errors.push("generatedAt must be a date");
  if (!FORMULA_SCOPES.has(contract.formula?.scope)) errors.push("formula.scope is invalid");
  if (!IDENTIFICATION_STATUSES.has(contract.product?.identificationStatus)) errors.push("product.identificationStatus is invalid");
  if (contract.product?.purpose != null) {
    if (!PURPOSE_STATUSES.has(contract.product.purpose.status)) errors.push("product.purpose.status is invalid");
    if (!textOrNull(contract.product.purpose.type) || !textOrNull(contract.product.purpose.label)) errors.push("product.purpose type and label are required");
    if (!textOrNull(contract.product.purpose.instruction?.status)) errors.push("product.purpose.instruction.status is required");
  }
  if (typeof contract.formula?.rawText !== "string") errors.push("formula.rawText must be a string");
  if (!contract.profile || typeof contract.profile !== "object" || Array.isArray(contract.profile)) errors.push("profile must be an object");
  if (!Array.isArray(contract.ingredients)) errors.push("ingredients must be an array");
  if (contract.assessment != null) {
    if (!ASSESSMENT_STATUSES.has(contract.assessment?.status)) errors.push("assessment.status is invalid");
    if (contract.assessment?.status === "not_assessed" && !textOrNull(contract.assessment?.reason)) {
      errors.push("assessment.reason is required when not assessed");
    }
    if (contract.assessment?.status === "assessed" && contract.assessment?.reason != null) {
      errors.push("assessment.reason must be null when assessed");
    }
  }

  for (const [index, ingredient] of (Array.isArray(contract.ingredients) ? contract.ingredients : []).entries()) {
    if (!MATCH_STATUSES.has(ingredient?.status)) errors.push(`ingredients[${index}].status is invalid`);
    const method = String(ingredient?.match?.method || "").toLowerCase();
    if (ingredient?.status === "confirmed" && AMBIGUOUS_MATCH_METHODS.has(method)) {
      errors.push(`ingredients[${index}] cannot confirm an ambiguous match`);
    }
    if (ingredient?.status === "confirmed" && !textOrNull(ingredient?.canonicalName)) {
      errors.push(`ingredients[${index}] confirmed match requires a canonicalName`);
    }
    const similarity = ingredient?.match?.stringSimilarity;
    if (similarity != null && numberOrNull(similarity) == null) errors.push(`ingredients[${index}].match.stringSimilarity is invalid`);
  }

  for (const name of ["ocrReadability", "productIdentification", "knowledgeCoverage"]) {
    const metric = contract.metrics?.[name];
    if (!metric || !METRIC_STATUSES.has(metric.status)) errors.push(`metrics.${name}.status is invalid`);
    if (metric?.value != null && numberOrNull(metric.value) == null) errors.push(`metrics.${name}.value is invalid`);
    if (metric?.status === "not_measured" && metric?.value != null) errors.push(`metrics.${name} must be null when not measured`);
    if (metric?.status === "measured" && numberOrNull(metric?.value) == null) errors.push(`metrics.${name} requires a measured value`);
  }

  return { valid: errors.length === 0, errors };
}

export function inspectStoredAnalysisContract(record) {
  const contract = record?.analysisContract
    || record?.analysis?.analysisContract
    || record?.payload?.analysis?.analysisContract
    || null;

  if (!contract) {
    return {
      status: "legacy",
      contract: null,
      reason: "missing_analysis_contract",
      errors: []
    };
  }

  const validation = validateAnalysisContract(contract);
  if (!validation.valid) {
    return {
      status: "invalid",
      contract: null,
      reason: "invalid_analysis_contract",
      errors: validation.errors
    };
  }

  return {
    status: "current",
    contract,
    reason: null,
    errors: []
  };
}
