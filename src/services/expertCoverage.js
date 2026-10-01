import { findCosIngIngredient, normalizeInciKey } from "./ingredientSources/cosing.js";

export const EXPERT_COVERAGE_VERSION = "1.0.0";
export const COVERAGE_STATUS_LABELS = Object.freeze({
  verified: "Проверено",
  review_required: "Требует предметной проверки",
  insufficient_data: "Недостаточно данных"
});

const COSING_INFO_URL = "https://single-market-economy.ec.europa.eu/sectors/cosmetics/cosmetic-ingredient-database_en";
const FULL_COMPOSITION_SCOPES = new Set(["full", "full_inci", "full_ingredients", "full_label_inci", "full_label_inci_from_photo"]);
const STRONG_WORDING = [
  /леч(?:ит|ение|ебн)/iu,
  /гарант/iu,
  /предотвращ/iu,
  /устраня/iu,
  /нормализ/iu,
  /стимулирует\s+(?:рост|синтез)/iu,
  /подавляет/iu,
  /защищает/iu,
  /восстанавливает/iu,
  /эффективно/iu,
  /надежн(?:ая|ую|ый|ое)/iu,
  /сильн(?:ый|ое|ая)/iu,
  /работает\s+с/iu
];

const roundRate = (part, total) => total ? Number((part / total).toFixed(4)) : null;
const unique = (values) => [...new Set(values)];
const text = (value) => String(value || "").trim();

function compositionOf(record) {
  return text(record.composition || record.ingredients_text || record.ingredientsText);
}

export function classifyCorpusRecord(record) {
  const composition = compositionOf(record);
  const id = text(record.id).toLowerCase();
  const brand = text(record.brand).toLowerCase();
  const sourceUrl = text(record.sourceUrl).toLowerCase();
  const scope = text(record.compositionScope).toLowerCase();
  const sourceType = text(record.sourceType).toLowerCase();
  if (!composition) return { eligible: false, reason: "missing_composition" };
  if (id.startsWith("demo-") || brand.startsWith("demo ") || sourceUrl.startsWith("internal://verified-demo")) {
    return { eligible: false, reason: "demo_formula" };
  }
  if (scope === "active_ingredients_only") return { eligible: false, reason: "partial_active_ingredients_only" };
  if (FULL_COMPOSITION_SCOPES.has(scope) || sourceType === "label_photo") {
    return { eligible: true, reason: "real_full_composition" };
  }
  return { eligible: false, reason: "composition_scope_not_verified_full" };
}

export function splitComposition(value) {
  return text(value)
    .split(/[,;\n\r]+/u)
    .map((item) => item.replace(/^[-–—•\s]+|[-–—•\s.]+$/gu, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function collectFormulaCorpus(datasets) {
  const records = [];
  for (const [dataset, values] of Object.entries(datasets)) {
    for (const record of values || []) records.push({ ...record, dataset });
  }
  const deduplicated = new Map();
  for (const record of records) {
    const identity = text(record.id || record.code || `${record.brand}|${record.name}|${record.barcode}`).toLowerCase();
    if (!deduplicated.has(identity)) deduplicated.set(identity, record);
  }
  const eligible = [];
  const excluded = [];
  for (const record of deduplicated.values()) {
    const classification = classifyCorpusRecord(record);
    const item = {
      id: record.id || record.code || null,
      name: record.name || null,
      brand: record.brand || null,
      dataset: record.dataset,
      sourceType: record.sourceType || null,
      sourceUrl: record.sourceUrl || null,
      compositionScope: record.compositionScope || null,
      reason: classification.reason
    };
    if (classification.eligible) eligible.push({ ...item, composition: compositionOf(record) });
    else excluded.push(item);
  }
  return { eligible, excluded, totalDeduplicated: deduplicated.size };
}

function ingredientIdentity(raw) {
  const match = findCosIngIngredient(raw);
  const confirmed = match && ["exact", "alias", "partial"].includes(match.match?.type);
  return {
    raw,
    name: confirmed ? match.name : raw,
    key: normalizeInciKey(confirmed ? match.name : raw),
    recognitionStatus: confirmed ? "confirmed" : match ? "suggested" : "unknown",
    suggestedMatch: !confirmed ? match?.match?.suggested_match || null : null,
    confidence: match?.match?.confidence || null,
    functions: confirmed ? match.functions || [] : [],
    sourceMetadata: confirmed ? match.sourceMetadata : null
  };
}

export function rankCorpusIngredients(corpus) {
  const ranked = new Map();
  for (const formula of corpus.eligible) {
    const seen = new Set();
    splitComposition(formula.composition).forEach((raw, index) => {
      const identity = ingredientIdentity(raw);
      if (!identity.key || seen.has(identity.key)) return;
      seen.add(identity.key);
      if (!ranked.has(identity.key)) ranked.set(identity.key, {
        ...identity,
        formulaCount: 0,
        occurrenceCount: 0,
        positions: [],
        formulaIds: []
      });
      const row = ranked.get(identity.key);
      row.formulaCount += 1;
      row.occurrenceCount += 1;
      row.positions.push(index + 1);
      row.formulaIds.push(formula.id);
    });
  }
  return [...ranked.values()]
    .map((row) => ({
      ...row,
      formulaIds: unique(row.formulaIds),
      meanPosition: Number((row.positions.reduce((sum, value) => sum + value, 0) / row.positions.length).toFixed(2))
    }))
    .sort((a, b) => b.formulaCount - a.formulaCount
      || b.occurrenceCount - a.occurrenceCount
      || a.meanPosition - b.meanPosition
      || a.name.localeCompare(b.name, "en"));
}

function claimStatus(claims) {
  if (claims.some((claim) => claim.evidenceStatus === "verified" && claim.review?.status === "approved")) return "verified";
  if (claims.some((claim) => claim.evidenceStatus === "review_required" && claim.review?.status === "pending")) return "review_required";
  return "insufficient_data";
}

export function buildPriorityBatch(ranking, knowledge, { checkedAt, limit = 25 } = {}) {
  const claimsByIngredient = new Map();
  for (const claim of knowledge.claims || []) {
    const key = normalizeInciKey(claim.ingredient);
    if (!claimsByIngredient.has(key)) claimsByIngredient.set(key, []);
    claimsByIngredient.get(key).push(claim);
  }
  return ranking.slice(0, Math.min(25, Math.max(0, limit))).map((row, index) => {
    const claims = claimsByIngredient.get(normalizeInciKey(row.name)) || [];
    const status = claimStatus(claims);
    return {
      rank: index + 1,
      ingredient: row.name,
      observedAs: row.raw,
      frequency: { formulaCount: row.formulaCount, occurrenceCount: row.occurrenceCount, corpusFormulaCount: ranking.length ? unique(ranking.flatMap((item) => item.formulaIds)).length : 0 },
      tieBreak: { meanPosition: row.meanPosition, rule: "frequency_desc_then_mean_formula_position_then_name" },
      nameRecognition: { status: row.recognitionStatus, suggestedMatch: row.suggestedMatch, confidence: row.confidence },
      roles: row.functions,
      roleEvidence: row.functions.length ? {
        status: "reference_only_legacy_snapshot",
        sourceUrl: COSING_INFO_URL,
        checkedAt,
        limitation: "Функции взяты из локального legacy-снимка справочника. Официальная страница CosIng объясняет назначение базы, но не подтверждает актуальность этой конкретной локальной строки."
      } : null,
      effects: claims.map((claim) => ({
        ruleId: claim.ruleId,
        possibleContribution: claim.possibleContribution,
        conditions: claim.conditions,
        limitations: claim.limitations,
        sources: claim.basis.map((basis) => {
          const source = knowledge.sources.find((item) => item.id === basis.sourceId);
          return { sourceId: basis.sourceId, url: source?.url || null, locator: basis.locator, checkedAt: source?.checkedAt || null };
        })
      })),
      riskAssessment: claims.length ? claims.map((claim) => ({ ruleId: claim.ruleId, ...claim.riskAssessment })) : {
        status: "insufficient_data",
        statements: [],
        limitations: ["Проверяемый источник о рисках для этой записи не добавлен."]
      },
      limitations: claims.length
        ? unique(claims.flatMap((claim) => claim.limitations))
        : ["Нет проверяемого экспертного утверждения. Роль справочника не доказывает эффект, безопасность или качество сырья."],
      checkedAt,
      evidenceStatus: status,
      statusLabel: COVERAGE_STATUS_LABELS[status]
    };
  });
}

function hasSource(record) {
  return Boolean(record.source || record.sourceUrl || record.references || record.sources || record.basis);
}

export function auditLegacyExpertEntries(entries) {
  const aliasOwners = new Map();
  for (const entry of entries) {
    for (const alias of [entry.name, ...(entry.aliases || [])]) {
      const normalized = normalizeInciKey(alias);
      if (!aliasOwners.has(normalized)) aliasOwners.set(normalized, new Set());
      aliasOwners.get(normalized).add(entry.name);
    }
  }
  const collisions = [...aliasOwners.entries()]
    .filter(([, owners]) => owners.size > 1)
    .map(([alias, owners]) => ({ alias, owners: [...owners].sort() }));
  const records = entries.map((entry) => {
    const claimsText = [...(entry.benefits || []), ...(entry.risks || []), ...(entry.best_for || []), ...(entry.avoid_for || [])];
    const overlap = (entry.best_for || []).filter((value) => (entry.avoid_for || []).some((other) => normalizeInciKey(other) === normalizeInciKey(value)));
    const issueCodes = [];
    if (!hasSource(entry)) issueCodes.push("missing_sources");
    if (Number.isFinite(entry.quality_score)) issueCodes.push("unsupported_numeric_quality_score");
    if (text(entry.evidence_level)) issueCodes.push("unsupported_evidence_label");
    if ((entry.benefits || []).length || (entry.risks || []).length || (entry.best_for || []).length || (entry.avoid_for || []).length) issueCodes.push("unsourced_domain_claims");
    if (claimsText.some((claim) => STRONG_WORDING.some((pattern) => pattern.test(claim)))) issueCodes.push("strong_wording_requires_review");
    if (overlap.length) issueCodes.push("structured_best_avoid_conflict");
    return {
      ingredient: entry.name,
      evidenceStatus: "insufficient_data",
      statusLabel: COVERAGE_STATUS_LABELS.insufficient_data,
      issueCodes,
      structuredConflicts: overlap,
      note: "Старая запись допускается для идентичности/эвристик, но ее эффекты, риски и числовой балл не являются проверенным экспертным фактом."
    };
  });
  const count = (code) => records.filter((record) => record.issueCodes.includes(code)).length;
  return {
    recordCount: entries.length,
    summary: {
      missingSources: count("missing_sources"),
      unsupportedNumericQualityScores: count("unsupported_numeric_quality_score"),
      unsupportedEvidenceLabels: count("unsupported_evidence_label"),
      unsourcedDomainClaims: count("unsourced_domain_claims"),
      strongWordingRequiresReview: count("strong_wording_requires_review"),
      structuredBestAvoidConflicts: count("structured_best_avoid_conflict"),
      aliasCollisions: collisions.length
    },
    contradictionScope: "Проверены только машинно доказуемые пересечения best_for/avoid_for и alias-коллизии. Смысловые противоречия требуют предметной проверки и не объявляются автоматически.",
    aliasCollisions: collisions,
    records
  };
}

export function buildCoverageReport({ corpus, ranking, priorityBatch, knowledge, legacyAudit, checkedAt }) {
  const recognized = ranking.filter((row) => row.recognitionStatus === "confirmed");
  const claimNames = new Set((knowledge.claims || []).filter((claim) => claim.review?.status !== "rejected").map((claim) => normalizeInciKey(claim.ingredient)));
  const reviewedNames = new Set((knowledge.claims || []).filter((claim) => claim.review?.status === "approved" && claim.evidenceStatus === "verified").map((claim) => normalizeInciKey(claim.ingredient)));
  const withClaims = recognized.filter((row) => claimNames.has(normalizeInciKey(row.name)));
  const withReviewedClaims = recognized.filter((row) => reviewedNames.has(normalizeInciKey(row.name)));
  const exclusionsByReason = Object.fromEntries(unique(corpus.excluded.map((item) => item.reason)).sort().map((reason) => [reason, corpus.excluded.filter((item) => item.reason === reason).length]));
  return {
    schemaVersion: "1.0",
    version: EXPERT_COVERAGE_VERSION,
    checkedAt,
    corpus: {
      totalDeduplicatedProducts: corpus.totalDeduplicated,
      eligibleRealFullFormulas: corpus.eligible.length,
      excludedProducts: corpus.excluded.length,
      exclusionsByReason,
      eligible: corpus.eligible.map(({ composition, ...item }) => ({ ...item, ingredientCount: splitComposition(composition).length })),
      excluded: corpus.excluded,
      limitation: "Локально доступен слишком малый корпус для репрезентативной оценки рынка. Частота используется только как воспроизводимый внутренний приоритет."
    },
    coverage: {
      nameRecognition: {
        numerator: recognized.length,
        denominator: ranking.length,
        rate: roundRate(recognized.length, ranking.length),
        definition: "Уникальные названия из допустимого корпуса, подтвержденные точным/alias/partial сопоставлением с INCI registry."
      },
      expertExplanation: {
        numerator: withClaims.length,
        denominator: recognized.length,
        rate: roundRate(withClaims.length, recognized.length),
        definition: "Распознанные ингредиенты, для которых есть отдельное source-backed утверждение; pending учитывается отдельно от предметно проверенного."
      },
      domainReviewedExplanation: {
        numerator: withReviewedClaims.length,
        denominator: recognized.length,
        rate: roundRate(withReviewedClaims.length, recognized.length),
        definition: "Распознанные ингредиенты с утверждением, одобренным предметным специалистом."
      },
      warning: "Рост распознавания имен не считается ростом экспертного покрытия. Pending и insufficient_data не показываются как проверенный факт."
    },
    priorityMethod: "frequency_desc_then_mean_formula_position_then_name; demo and partial active-only lists excluded",
    priorityBatch,
    legacyAudit
  };
}
