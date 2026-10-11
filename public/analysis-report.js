export const REPORT_PRESENTATION_VERSION = "1.0.0";

export const FORMULA_SCOPE_LABELS = Object.freeze({
  full: "Список отмечен как полный INCI.",
  active_only: "Источник указал только активные компоненты, а не полный INCI.",
  partial: "Доступен неполный фрагмент формулы.",
  unknown: "Полнота состава не подтверждена источником."
});

export const FORMULA_CONFIRMATION_LABELS = Object.freeze({
  source_declared: "полнота заявлена источником",
  user_confirmed: "пользователь подтвердил по этикетке; производителем не проверено",
  unverified: "полнота не подтверждена",
  conflicting: "источники сообщают разные версии"
});

export const FORMULA_ASSOCIATION_LABELS = Object.freeze({
  confirmed: "состав относится к выбранной карточке",
  unconfirmed: "принадлежность выбранной карточке не подтверждена",
  unknown: "принадлежность товара не установлена"
});

export const PRODUCT_STATUS_LABELS = Object.freeze({
  confirmed: "товар подтверждён выбранной карточкой",
  suggested: "товар определён предположительно",
  unknown: "товар не идентифицирован"
});

const SYSTEM_STATUS_LABELS = Object.freeze({
  described: "Описано по проверенному правилу",
  reference_only: "Найдена справочная функция",
  not_identified: "Не выявлено в полном INCI",
  insufficient_data: "Не удалось определить",
  not_applicable: "Неприменимо к этому типу продукта"
});

const PERSONAL_STATUS_LABELS = Object.freeze({
  restricted: "Есть ограничение",
  caution: "Требуется уточнение",
  potential_fit: "Возможно соответствует цели",
  insufficient_data: "Недостаточно данных",
  general_only: "Только общий разбор"
});

const unique = (values) => [...new Set((values || []).filter(Boolean))];
const text = (value) => String(value ?? "").trim();

function indexBy(items, field = "id") {
  return new Map((items || []).filter((item) => item?.[field]).map((item) => [item[field], item]));
}

function resolveClaims(ids, claimIndex) {
  return unique(ids).map((id) => claimIndex.get(id)).filter(Boolean);
}

function claimSources(claims, sourceIndex) {
  const ids = unique(claims.flatMap((claim) => (claim.basis || []).map((basis) => basis.sourceId)));
  return ids.map((id) => sourceIndex.get(id)).filter(Boolean);
}

function systemExplanation(system, completeFormula) {
  if (system.status === "described") {
    return "Есть предметно проверенное правило с подходящими условиями. Это не доказывает качество или эффективность готового продукта.";
  }
  if (system.status === "reference_only") {
    return "Идентичность или справочная функция компонентов установлена, но назначение и эффект готового продукта этим не подтверждаются.";
  }
  if (system.status === "not_applicable") {
    return "Система признана неприменимой по подтверждённому контексту продукта, а не просто из-за отсутствия совпадений.";
  }
  if (system.status === "not_identified" && completeFormula) {
    return "В переданном полном INCI компоненты этой системы не идентифицированы. Это не лабораторное доказательство химического отсутствия.";
  }
  return "По доступному составу систему определить нельзя: формула неполна, содержит нераспознанные позиции или не хватает контекстных данных.";
}

function metricLabel(metric) {
  const names = {
    ingredient_percentage: "Процент ингредиента",
    mixture_percentage: "Процент смеси",
    spf: "SPF",
    uva_pf: "UVA-PF",
    ph: "pH",
    critical_wavelength: "Критическая длина волны",
    water_resistance: "Водостойкость"
  };
  return names[metric?.kind || metric?.type] || text(metric?.label || metric?.kind || metric?.type) || "Показатель";
}

function quantitativeRows(assessment) {
  return (assessment.quantitative || []).map((metric) => ({
    label: metricLabel(metric),
    value: metric.displayValue || metric.rawValue || metric.value || "значение не указано",
    status: metric.status || metric.verification || "unknown",
    sourceClaimId: metric.claimId || null
  }));
}

function productMetricRows(assessment) {
  return (assessment.photoprotection?.productMetrics || []).map((metric) => ({
    label: metricLabel(metric),
    value: metric.displayValue || metric.rawValue || metric.value || "значение не указано",
    status: metric.status || metric.verification || "unknown",
    sourceClaimId: metric.claimId || null
  }));
}

export function buildAnalysisReportModel(data = {}, fallbackProductName = "") {
  const contract = data.analysisContract || {};
  const assessment = data.formulaAssessment || {};
  const claims = assessment.claims || [];
  const sources = assessment.sources || [];
  const claimIndex = indexBy(claims);
  const sourceIndex = indexBy(sources);
  const ingredientIndex = indexBy(assessment.ingredients || []);
  const identity = contract.product?.identity || {};
  const formula = contract.formula || {};
  const coverage = contract.metrics?.knowledgeCoverage || {};
  const unresolved = assessment.formulaRef?.unresolvedIngredientRefs || [];
  const formulaScope = formula.scope || assessment.formulaRef?.scope || "unknown";
  const formulaConfirmation = formula.confirmation || assessment.formulaRef?.confirmation || "unverified";
  const completeFormula = formulaScope === "full"
    && ["source_declared", "user_confirmed"].includes(formulaConfirmation)
    && unresolved.length === 0;

  const systems = (assessment.systems || []).map((system) => {
    const roleClaims = resolveClaims(system.roleClaimIds, claimIndex);
    const assessmentClaims = resolveClaims(system.assessmentClaimIds, claimIndex);
    const cautionClaims = resolveClaims(system.cautionClaimIds, claimIndex);
    const unknownClaims = resolveClaims(system.unknownClaimIds, claimIndex);
    const allClaims = unique([...assessmentClaims, ...roleClaims, ...cautionClaims, ...unknownClaims]);
    return {
      id: system.id,
      label: system.label,
      status: system.status,
      statusLabel: SYSTEM_STATUS_LABELS[system.status] || "Статус не определён",
      explanation: systemExplanation(system, completeFormula),
      ingredients: (system.ingredientRefs || []).map((id) => ingredientIndex.get(id)).filter(Boolean),
      roleClaims,
      assessmentClaims,
      cautionClaims,
      unknownClaims,
      sources: claimSources(allClaims, sourceIndex),
      requiredInputs: system.requiredInputs || []
    };
  });

  const personal = assessment.personalFit || {};
  const personalClaims = {
    goals: resolveClaims(personal.goalMatchClaimIds, claimIndex),
    precautions: resolveClaims(personal.precautionClaimIds, claimIndex),
    restrictions: resolveClaims(personal.restrictionClaimIds, claimIndex),
    unknown: resolveClaims(personal.unknownClaimIds, claimIndex)
  };
  const summaryClaims = resolveClaims(assessment.summary?.claimIds, claimIndex);
  const limitationClaims = resolveClaims(assessment.limitations, claimIndex);
  const quantitative = quantitativeRows(assessment);
  const productMetrics = productMetricRows(assessment);
  const confirmed = Number.isFinite(coverage.confirmed) ? coverage.confirmed : data.found?.length || 0;
  const total = Number.isFinite(coverage.total) ? coverage.total : data.totalIngredients || 0;
  const title = [identity.brand, identity.name].filter(Boolean).join(" ") || text(fallbackProductName) || "Средство не идентифицировано";
  const restriction = personalClaims.restrictions[0]?.text || data.personalization?.restrictions?.[0]?.text || null;
  const precaution = personalClaims.precautions[0]?.text || data.personalization?.precautions?.[0]?.text || null;

  return {
    version: REPORT_PRESENTATION_VERSION,
    title,
    productStatus: contract.product?.identificationStatus || "unknown",
    productStatusLabel: PRODUCT_STATUS_LABELS[contract.product?.identificationStatus] || PRODUCT_STATUS_LABELS.unknown,
    purpose: data.productSafety || data.productClassification || {},
    formula,
    formulaScope,
    formulaScopeLabel: FORMULA_SCOPE_LABELS[formulaScope] || FORMULA_SCOPE_LABELS.unknown,
    formulaConfirmationLabel: FORMULA_CONFIRMATION_LABELS[formulaConfirmation] || FORMULA_CONFIRMATION_LABELS.unverified,
    formulaAssociationLabel: FORMULA_ASSOCIATION_LABELS[formula.associationStatus] || FORMULA_ASSOCIATION_LABELS.unknown,
    completeFormula,
    coverage: { confirmed, total, suggested: coverage.suggested || 0, unknown: coverage.unknown || 0 },
    assessmentStatus: assessment.status || "needs_input",
    concise: {
      headline: restriction ? "Есть ограничение" : precaution ? "Требуется уточнение" : "Разбор готов",
      primaryNotice: restriction || precaution || data.summary || "Доступен общий справочный разбор.",
      facts: [
        `Тип: ${text(data.productSafety?.label || data.formulaType) || "не подтверждён"}`,
        `Состав: ${FORMULA_SCOPE_LABELS[formulaScope] || FORMULA_SCOPE_LABELS.unknown}`,
        `Совпадения: ${confirmed} из ${total}`,
        `Персональный вывод: ${PERSONAL_STATUS_LABELS[personal.status] || "не сформирован"}`
      ]
    },
    systems,
    ingredients: assessment.ingredients || [],
    claims,
    sources,
    summaryClaims,
    limitationClaims,
    quantitative,
    photoprotection: {
      filters: (assessment.photoprotection?.filters || []).map((item) => ({
        ...item,
        ingredient: ingredientIndex.get(item.ingredientRef) || null,
        spectrumClaims: resolveClaims(item.spectrumClaimIds, claimIndex)
      })),
      productMetrics,
      instructions: resolveClaims(assessment.photoprotection?.instructionClaimIds, claimIndex),
      unknown: resolveClaims(assessment.photoprotection?.unknownClaimIds, claimIndex)
    },
    duration: assessment.duration || [],
    tolerability: {
      irritation: resolveClaims(assessment.tolerability?.irritationClaimIds, claimIndex),
      sensitization: resolveClaims(assessment.tolerability?.sensitizationClaimIds, claimIndex),
      hypoallergenic: resolveClaims(assessment.tolerability?.manufacturerHypoallergenicClaimIds, claimIndex),
      unknown: resolveClaims(assessment.tolerability?.unknownClaimIds, claimIndex)
    },
    personal: {
      status: personal.status || "general_only",
      statusLabel: PERSONAL_STATUS_LABELS[personal.status] || PERSONAL_STATUS_LABELS.general_only,
      ...personalClaims,
      missingInputs: personal.missingInputs || [],
      missingInputsByConclusion: personal.missingInputsByConclusion || [],
      safetyEstablished: personal.safetyEstablished === true,
      applicationAdviceAllowed: personal.applicationAdviceAllowed === true
    }
  };
}
