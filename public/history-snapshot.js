export const HISTORY_SNAPSHOT_VERSION = "1.0";

const MEDIA_KEY = /(photo|image|thumbnail|dataurl|blob)|^(file|files)$/i;

function cloneJson(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function withoutMedia(value) {
  if (Array.isArray(value)) return value.map(withoutMedia);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !MEDIA_KEY.test(key))
    .map(([key, item]) => [key, withoutMedia(item)]));
}

function removeStoredProfile(analysis) {
  const safe = withoutMedia(cloneJson(analysis, {}));
  if (safe?.personalization) {
    safe.personalization.profile = {};
    safe.personalization.usedInputs = [];
  }
  if (safe?.analysisContract) {
    safe.analysisContract.profile = {};
    if (safe.analysisContract.personalization) {
      safe.analysisContract.personalization.profile = {};
      safe.analysisContract.personalization.usedInputs = [];
    }
  }
  return safe;
}

function normalizeSource(source, fallbackName = "") {
  return {
    name: text(source?.name || fallbackName) || null,
    type: text(source?.type) || null,
    url: text(source?.url) || null,
    retrievedAt: text(source?.retrievedAt) || null
  };
}

function productFromContract(contract, fallbackName = "") {
  const identity = contract?.product?.identity || {};
  return {
    identity: {
      id: text(identity.id) || null,
      barcode: text(identity.barcode) || null,
      brand: text(identity.brand) || null,
      name: text(identity.name || fallbackName) || null
    },
    identificationStatus: text(contract?.product?.identificationStatus) || "unknown",
    source: normalizeSource(contract?.product?.source)
  };
}

function formulaFromContract(contract, composition, fallbackSource = "") {
  return {
    composition,
    normalizedText: text(contract?.formula?.normalizedText) || null,
    scope: text(contract?.formula?.scope) || "unknown",
    version: text(contract?.formula?.version) || null,
    market: text(contract?.formula?.market) || null,
    source: normalizeSource(contract?.formula?.source, fallbackSource)
  };
}

function confirmationFromContract(contract) {
  const coverage = contract?.metrics?.knowledgeCoverage || {};
  return {
    productIdentification: text(contract?.product?.identificationStatus) || "unknown",
    assessmentStatus: text(contract?.assessment?.status) || "unknown",
    ingredients: {
      confirmed: Number.isFinite(coverage.confirmed) ? coverage.confirmed : null,
      suggested: Number.isFinite(coverage.suggested) ? coverage.suggested : null,
      unknown: Number.isFinite(coverage.unknown) ? coverage.unknown : null,
      total: Number.isFinite(coverage.total) ? coverage.total : null
    }
  };
}

function validAnalysis(analysis) {
  return Boolean(analysis && typeof analysis === "object" && !Array.isArray(analysis) && !analysis.error);
}

export function buildAnalysisHistoryEntry(payload = {}, analysis, sourceLabel = "", options = {}) {
  if (!validAnalysis(analysis) || analysis?.historyPolicy?.mode === "session_only") return null;

  const safeAnalysis = removeStoredProfile(analysis);
  const contract = safeAnalysis.analysisContract || {};
  const composition = String(payload.text ?? contract?.formula?.rawText ?? "").slice(0, 4000);
  const product = productFromContract(contract, payload.productName);
  const formula = formulaFromContract(contract, composition, sourceLabel);
  const capturedAt = text(options.capturedAt || contract.generatedAt) || new Date().toISOString();
  const title = text(payload.productName)
    || [product.identity.brand, product.identity.name].filter(Boolean).join(" ")
    || text(sourceLabel)
    || text(safeAnalysis.formulaType)
    || "Разбор состава";

  const snapshot = {
    schemaVersion: HISTORY_SNAPSHOT_VERSION,
    status: "completed",
    capturedAt,
    analysisContractVersion: text(contract.schemaVersion) || null,
    algorithmVersion: text(contract.algorithmVersion) || null,
    evidenceVersions: cloneJson(contract.evidenceVersions || safeAnalysis.evidenceVersions, null),
    product,
    formula,
    completeness: {
      formulaScope: formula.scope,
      knowledgeCoverage: cloneJson(contract?.metrics?.knowledgeCoverage, null)
    },
    confirmations: confirmationFromContract(contract),
    profile: {
      stored: false,
      reason: "profile_not_stored_without_explicit_consent"
    },
    result: safeAnalysis
  };

  return {
    kind: "analysis",
    title,
    productName: text(payload.productName),
    score: safeAnalysis.score?.score,
    formulaType: safeAnalysis.formulaType,
    payload: {
      snapshot,
      productName: text(payload.productName),
      source: formula.source.name || text(sourceLabel),
      composition,
      score: safeAnalysis.score?.score,
      formulaType: safeAnalysis.formulaType,
      analysis: safeAnalysis
    }
  };
}

export function sanitizeHistoryEntryForPrivacy(entry) {
  const safe = withoutMedia(cloneJson(entry, {}));
  if (!safe?.payload || typeof safe.payload !== "object") return safe;

  delete safe.payload.profile;
  if (safe.payload.analysis) safe.payload.analysis = removeStoredProfile(safe.payload.analysis);
  if (safe.payload.snapshot) {
    safe.payload.snapshot.profile = {
      stored: false,
      reason: "profile_not_stored_without_explicit_consent"
    };
    if (safe.payload.snapshot.result) safe.payload.snapshot.result = removeStoredProfile(safe.payload.snapshot.result);
  }
  return safe;
}

export function inspectAnalysisHistoryEntry(entry) {
  const safeEntry = sanitizeHistoryEntryForPrivacy(entry);
  const payload = safeEntry?.payload || {};
  const snapshot = payload.snapshot;

  if (snapshot?.schemaVersion === HISTORY_SNAPSHOT_VERSION
      && snapshot.status === "completed"
      && validAnalysis(snapshot.result)) {
    return {
      status: "snapshot",
      entry: safeEntry,
      snapshot,
      analysis: snapshot.result,
      composition: text(snapshot.formula?.composition || payload.composition),
      capturedAt: text(snapshot.capturedAt || safeEntry.createdAt) || null,
      legacyNotice: null
    };
  }

  if (validAnalysis(payload.analysis)) {
    return {
      status: "legacy",
      entry: safeEntry,
      snapshot: null,
      analysis: payload.analysis,
      composition: text(payload.composition || payload.analysis?.analysisContract?.formula?.rawText),
      capturedAt: text(safeEntry.createdAt) || null,
      legacyNotice: "Старая запись: версия правил и полное происхождение результата тогда не сохранялись."
    };
  }

  return {
    status: "invalid",
    entry: safeEntry,
    snapshot: null,
    analysis: null,
    composition: text(payload.composition),
    capturedAt: text(safeEntry.createdAt) || null,
    legacyNotice: "Запись не содержит завершённого снимка анализа."
  };
}

export function buildReanalysisRequest(entry) {
  const inspected = inspectAnalysisHistoryEntry(entry);
  if (!inspected.analysis || !inspected.composition) return null;
  const snapshot = inspected.snapshot;
  const contract = inspected.analysis.analysisContract || {};
  const product = snapshot?.product || productFromContract(contract, inspected.entry?.payload?.productName);
  const formula = snapshot?.formula || formulaFromContract(
    contract,
    inspected.composition,
    inspected.entry?.payload?.source
  );

  return {
    text: inspected.composition,
    productName: text(inspected.entry?.payload?.productName || product?.identity?.name || inspected.entry?.title),
    profile: {},
    evidence: {
      product: {
        ...cloneJson(product?.identity, {}),
        identificationStatus: product?.identificationStatus || "unknown",
        source: cloneJson(product?.source, {})
      },
      formula: {
        scope: formula?.scope || "unknown",
        version: formula?.version || null,
        market: formula?.market || null,
        source: cloneJson(formula?.source, {})
      }
    }
  };
}

export function isCompletedAnalysisHistoryEntry(entry) {
  return inspectAnalysisHistoryEntry(entry).status === "snapshot";
}
