import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanInciText } from "./services/inciCleaner.js";
import { findCosIngIngredient } from "./services/ingredientSources/cosing.js";
import { classifyFormulaProduct } from "./services/productClassifier.js";
import { evaluateExpertRules } from "./services/expertRules.js";
import { buildPersonalContext, evaluatePersonalization } from "./services/personalization.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INGREDIENTS_PATH = path.join(__dirname, "..", "data", "ingredients-expert.json");

const INGREDIENTS = JSON.parse(fs.readFileSync(INGREDIENTS_PATH, "utf8"));
const INGREDIENT_INDEX = buildIngredientIndex(INGREDIENTS);

const PROPRIETARY_COMPLEX_PATTERNS = [
  /\bret\s+complex\b/i,
  /\b[a-z0-9+\-\s]+complex\b/i
];

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\p{L}\p{N}+\-/\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildIngredientIndex(items) {
  const index = new Map();
  items.forEach((item) => {
    [item.name, ...(item.aliases || [])].forEach((name) => {
      const key = normalize(name);
      if (key) index.set(key, item);
    });
  });
  return index;
}

function notAssessedConcentration() {
  return {
    status: "not_assessed",
    reason: "INCI_order_does_not_establish_concentration"
  };
}


export function parseIngredients(text) {
  return cleanInciText(text || "").ingredients;
}

function findIngredient(raw) {
  if (PROPRIETARY_COMPLEX_PATTERNS.some((pattern) => pattern.test(String(raw || "")))) {
    return {
      name: String(raw || "").trim(),
      category: "proprietary_complex",
      roles: [],
      benefits: [],
      risks: ["Комплекс производителя: свойства и концентрации нельзя определить по INCI без раскрытого состава."],
      best_for: [],
      avoid_for: [],
      quality_score: 0,
      evidence_level: "undisclosed",
      dataSource: "proprietary_complex",
      excludedFromScoring: true
    };
  }

  const key = normalize(raw);
  if (INGREDIENT_INDEX.has(key)) return INGREDIENT_INDEX.get(key);

  const slashParts = key.split("/").map((part) => part.trim()).filter(Boolean);
  for (const part of slashParts) {
    if (INGREDIENT_INDEX.has(part)) return INGREDIENT_INDEX.get(part);
  }

  const cosing = findCosIngIngredient(raw);
  if (!cosing) return null;
  if (cosing.match?.type === "fuzzy" && (cosing.match.confidence || 0) < 0.95) return null;

  return {
    name: cosing.name,
    category: cosing.functions[0] || "CosIng",
    roles: cosing.functions,
    benefits: cosing.functions.length ? [`Функции по CosIng: ${cosing.functions.join(", ")}.`] : ["Ингредиент найден в CosIng, функции не указаны."],
    risks: [],
    best_for: [],
    avoid_for: [],
    quality_score: null,
    evidence_level: "cosing",
    dataSource: cosing.source,
    referenceType: cosing.referenceType,
    sourceFile: cosing.sourceFile,
    match: cosing.match
  };
}

function formulaScores(assessment) {
  return {
    hydration_score: null,
    barrier_score: null,
    irritation_risk: null,
    active_score: null,
    status: "not_assessed",
    reason: assessment.reason
  };
}

function assessmentReasonText(reason) {
  const reasons = {
    non_cosmetic_formula: "средство не относится к обычным косметическим формулам",
    active_only_formula: "есть только список активов, а не полный INCI",
    partial_formula: "состав помечен как неполный",
    unresolved_ingredients: "часть ингредиентов не распознана",
    registry_only_no_expert_assessment: "есть только справочные функции CosIng без экспертной оценки компонентов",
    insufficient_expert_coverage: "для части состава нет экспертных свойств",
    insufficient_formula_completeness: "слишком мало данных о полной формуле",
    unvalidated_scoring_method: "нет валидированной методики числовой оценки и данных готового продукта"
  };
  return reasons[reason] || "недостаточно подтверждённых данных о формуле";
}

function normalizedFormulaScope(value) {
  const scope = String(value || "unknown").trim().toLowerCase();
  if (scope === "active_ingredients_only") return "active_only";
  return ["full", "active_only", "partial", "unknown"].includes(scope) ? scope : "unknown";
}

function isActiveOnlyName(productName) {
  return /(?:active\s+ingredients?\s+only|только\s+актив(?:ные|ы)|список\s+актив)/i.test(String(productName || ""));
}

function assessFormula({ found, unknownCount, totalIngredients, productSafety, formulaScope, productName }) {
  if (productSafety?.shouldScoreAsCosmetic === false) {
    return { status: "not_assessed", reason: "non_cosmetic_formula" };
  }
  const scope = normalizedFormulaScope(formulaScope);
  if (scope === "active_only" || isActiveOnlyName(productName)) {
    return { status: "not_assessed", reason: "active_only_formula" };
  }
  if (scope === "partial") {
    return { status: "not_assessed", reason: "partial_formula" };
  }
  if (unknownCount > 0) {
    return { status: "not_assessed", reason: "unresolved_ingredients" };
  }
  if (scope !== "full") {
    return { status: "not_assessed", reason: "insufficient_formula_completeness" };
  }

  if (found.length && found.every((item) => item.referenceType === "inci_registry")) {
    return { status: "not_assessed", reason: "registry_only_no_expert_assessment" };
  }
  if (found.some((item) => item.excludedFromScoring)) {
    return { status: "not_assessed", reason: "insufficient_expert_coverage" };
  }
  if (totalIngredients < 4) {
    return { status: "not_assessed", reason: "insufficient_formula_completeness" };
  }
  return { status: "not_assessed", reason: "unvalidated_scoring_method" };
}

function buildQualitySummary(unknownCount, totalIngredients, assessment) {
  return {
    score: null,
    status: "not_assessed",
    reason: assessment.reason,
    label: assessment.reason === "non_cosmetic_formula"
      ? "не оценивается как косметическая формула"
      : "оценка не выполнена",
    confidence: "недостаточно данных",
    knownCount: 0,
    unknownCount,
    totalIngredients
  };
}

function scoreFormula(assessment) {
  return { score: null, label: "оценка не выполнена", status: "not_assessed", reason: assessment.reason };
}

function nonCosmeticScores() {
  return {
    hydration_score: null,
    barrier_score: null,
    irritation_risk: null,
    active_score: null,
    status: "not_assessed",
    reason: "non_cosmetic_formula"
  };
}

function buildProcedureOverride({ safety }) {
  return {
    expertScores: nonCosmeticScores(),
    formulaType: safety.label,
    score: { score: null, label: "не оценивать как уходовое средство", status: "not_assessed", reason: "non_cosmetic_formula" },
    confidence: {
      label: "требует проверки инструкции",
      text: "Класс продукта определен по сигнальным ингредиентам, но безопасность применения нельзя выводить только по INCI."
    },
    disclaimer: "Это не медицинское назначение. Необходимы инструкция производителя и проверка назначения продукта."
  };
}

function confidenceLevel(found, totalIngredients, unknownCount) {
  if (!totalIngredients) {
    return { label: "низкая", text: "Состав не удалось разобрать: нужен полный список ингредиентов." };
  }
  const ratio = found.length / totalIngredients;
  if (ratio >= 0.85 && unknownCount <= 3) {
    return { label: "хорошая", text: "Большая часть состава распознана. Ограничения: неизвестны проценты, pH и тесты готового продукта." };
  }
  if (ratio >= 0.55) {
    return { label: "средняя", text: "Часть состава распознана, поэтому выводы лучше считать предварительными." };
  }
  return { label: "низкая", text: "Много ингредиентов не найдено в экспертной базе, анализ требует ручной проверки." };
}

function buildProprietaryComplexes(found) {
  return found
    .filter((item) => item.category === "proprietary_complex")
    .map((item) => ({
      name: item.name,
      input: item.input,
      note: "Комплекс производителя сохранен как исходное название. Его свойства, состав и концентрации нельзя определить по INCI без раскрытия производителем.",
      excludedFromScoring: true
    }));
}

export function analyzeComposition({ text, profile = {}, productName = "", formulaScope = "unknown", productEvidence = {} }) {
  const inciCleaning = cleanInciText(text || "");
  const ingredients = inciCleaning.ingredients;
  const found = [];
  const unknown = [];

  ingredients.forEach((ingredient, index) => {
    const entry = inciCleaning.entries.find((item) => !item.duplicateOf && item.ingredient === ingredient);
    const record = entry?.status === "confirmed" || entry?.origin === "proprietary_complex"
      ? findIngredient(entry.canonicalName || ingredient)
      : null;
    if (record) {
      found.push({
        input: ingredient,
        provenance: entry,
        status: entry.status,
        name: record.name,
        ru: record.category,
        category: record.category,
        roles: record.roles || [],
        benefits: [],
        risks: [],
        best_for: [],
        avoid_for: [],
        quality_score: null,
        ingredient_quality_score: null,
        quality_label: "не оценивается",
        evidence_level: "not_assessed",
        dataSource: record.dataSource || "expert",
        referenceType: record.referenceType || null,
        suggested_match: record.match?.suggested_match,
        match_confidence: record.match?.confidence,
        match_type: record.match?.type,
        excludedFromScoring: Boolean(record.excludedFromScoring),
        note: "",
        cautions: [],
        skin: [],
        position: index + 1,
        concentration: null,
        concentrationAssessment: notAssessedConcentration()
      });
      return;
    }

    const suggestion = inciCleaning.suggestions.find((item) => normalize(item.original) === normalize(ingredient));
    unknown.push({
      input: ingredient,
      name: ingredient,
      provenance: entry,
      status: entry?.status || "unknown",
      position: index + 1,
      concentration: null,
      concentrationAssessment: notAssessedConcentration(),
      suggested_match: entry?.suggested_match || suggestion?.suggested_match,
      match_confidence: entry?.match_confidence ?? suggestion?.confidence
    });
  });

  const productSafety = classifyFormulaProduct({ ingredients, found, rawText: text || "", productName, productEvidence });
  const procedureOverride = productSafety.shouldScoreAsCosmetic
    ? null
    : buildProcedureOverride({ safety: productSafety, ingredients, found, unknown });
  const assessment = procedureOverride
    ? { status: "not_assessed", reason: "non_cosmetic_formula" }
    : assessFormula({
      found,
      unknownCount: unknown.length,
      totalIngredients: ingredients.length,
      productSafety,
      formulaScope,
      productName
    });
  const expertScores = procedureOverride?.expertScores || formulaScores(assessment);
  const formulaType = procedureOverride?.formulaType || productSafety.label;
  const context = buildPersonalContext(profile, productSafety);
  const evidence = evaluateExpertRules({ found, unknown, assessment, productSafety, context });
  const personalization = evaluatePersonalization({ profile, found, unknown, formulaScope, productSafety, evidence });
  const warnings = [...new Set([
    ...personalization.restrictions.map((x) => x.text),
    ...personalization.precautions.map((x) => x.text),
    ...evidence.limitations.map((finding) => finding.text)
  ])];
  const positives = [];
  const confidence = procedureOverride?.confidence || confidenceLevel(found, ingredients.length, unknown.length);
  const score = procedureOverride?.score || scoreFormula(assessment);
  const expertSummary = [
    evidence.findings.find((finding) => finding.ruleId === "reference.formula.functions").text,
    ...evidence.expertFindings.map((finding) => `${finding.text} Источник: ${finding.basis.map((ref) => ref.url).join(", ")}`),
    evidence.limitations[0].text
  ];
  const proprietaryComplexes = buildProprietaryComplexes(found);
  const qualitySummary = buildQualitySummary(unknown.length, ingredients.length, assessment);
  qualitySummary.ruleId = "guard.product-evidence";
  qualitySummary.knownCount = evidence.coverage.withReviewedClaims;
  qualitySummary.methodology = evidence.limitations[0].text;

  const purposeSummary = productSafety.purposeStatus === "confirmed_manufacturer"
    ? `Назначение по карточке производителя: ${formulaType}.`
    : productSafety.purposeStatus === "source_backed"
      ? `Назначение по выбранной карточке источника: ${formulaType}; подтверждение производителя не установлено.`
      : productSafety.purposeStatus === "hypothesis"
        ? `Гипотеза о типе продукта: ${formulaType}; производитель ее не подтверждал.`
        : productSafety.purposeStatus === "safety_flag"
          ? `Защитная классификация: ${formulaType}; точное назначение требует официальной инструкции.`
          : "Назначение продукта не подтверждено: требуется этикетка или карточка производителя.";
  const summary = [
    purposeSummary,
    found.length ? `Распознано ингредиентов: ${found.length} из ${ingredients.length}.` : "Пока не удалось уверенно распознать ингредиенты из экспертной базы.",
    evidence.limitations.find((finding) => finding.ruleId === "guard.non-cosmetic")?.text,
    `Итоговые баллы, оценка риска и рекомендации по уходу не оцениваются: ${assessmentReasonText(assessment.reason)}.`
  ].filter(Boolean).join(" ");

  const classifiedProduct = {
    ...productSafety,
    ruleId: "guard.classification",
    reviewStatus: productSafety.purposeStatus === "confirmed_manufacturer" ? "source_backed" : "unreviewed_heuristic",
    safetyNotes: [...new Set([...(productSafety.safetyNotes || []), ...warnings])]
  };
  if (personalization.profileProvided && ["blocked", "review_required"].includes(personalization.status)) {
    classifiedProduct.application = "Персональная рекомендация по применению не сформирована: сначала проверьте ограничения в персональном итоге.";
    classifiedProduct.applicationEvidence = { status: "withheld", basis: "personal_restrictions", source: null };
  }

  return {
    summary,
    personalization,
    historyPolicy: { mode: personalization.profileProvided ? "session_only" : "standard", reason: personalization.profileProvided ? "personal_profile_without_storage_consent" : null },
    formulaType,
    score: { ...score, ruleId: "guard.product-evidence" },
    hydration_score: expertScores.hydration_score,
    barrier_score: expertScores.barrier_score,
    irritation_risk: expertScores.irritation_risk,
    active_score: expertScores.active_score,
    expertScores: { ...expertScores, ruleId: "guard.product-evidence" },
    assessment,
    qualitySummary,
    productSafety: classifiedProduct,
    productClassification: classifiedProduct,
    totalIngredients: ingredients.length,
    inciCleaning,
    found: evidence.ingredients,
    unknown,
    groups: evidence.groups,
    positives,
    warnings,
    architecture: evidence.groups.map((group) => ({ title: group.role, text: group.items.join(", "), ruleId: group.ruleId, kind: "reference" })),
    proprietaryComplexes: proprietaryComplexes.map((item) => ({ ...item, ruleId: "guard.undisclosed" })),
    expertSummary,
    expertSummaryRuleIds: ["reference.formula.functions", ...evidence.expertFindings.map((finding) => finding.ruleId), "guard.product-evidence"],
    routineAdvice: [],
    questions: [productSafety.requiredVerification || "Какие назначение, полный состав и данные испытаний готового продукта предоставлены производителем?"],
    findings: evidence.findings,
    evidenceVersions: evidence.versions,
    evidenceCoverage: evidence.coverage,
    finishedProductAssessment: evidence.finishedProduct,
    confidence,
    disclaimer: procedureOverride?.disclaimer || "Это справочный разбор состава, а не медицинское назначение. По INCI нельзя надежно определить точные проценты, pH, SPF/UVA-PF и индивидуальную переносимость."
  };
}

export function formatTelegramReport(result) {
  const topGroups = result.groups
    .slice(0, 8)
    .map((group) => `• ${group.role}: ${group.items.slice(0, 4).join(", ")}`)
    .join("\n");

  const warnings = result.warnings.length
    ? result.warnings.slice(0, 5).map((item) => `• ${item}`).join("\n")
    : "• Явных красных флагов в экспертной базе не найдено.";

  return [
    "Разбор состава",
    "",
    result.summary,
    "",
    `Оценка: ${result.score.score}/100 (${result.score.label})`,
    `Увлажнение: ${result.hydration_score}/100 · Барьер: ${result.barrier_score}/100 · Активность: ${result.active_score}/100 · Риск раздражения: ${result.irritation_risk}/100`,
    "",
    "Группы компонентов:",
    topGroups || "• Пока недостаточно распознанных компонентов.",
    "",
    "На что обратить внимание:",
    warnings,
    "",
    result.disclaimer
  ].join("\n");
}
