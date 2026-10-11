import { normalizeAnalysisProfile, hasPersonalProfile } from "../../public/analysis-profile.js";
import { getInciRegistrySnapshot } from "./ingredientSources/inciRegistry.js";

export const PERSONALIZATION_VERSION = "2.0.0";

const key = (value) => String(value || "").normalize("NFKC").trim().toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ");
const unique = (values) => [...new Set(values.filter(Boolean))];
const aliases = new Map();

for (const row of getInciRegistrySnapshot().records) {
  for (const name of [row.name, ...(row.aliases || [])]) {
    const normalized = key(name);
    if (!aliases.has(normalized)) aliases.set(normalized, new Set());
    aliases.get(normalized).add(key(row.name));
  }
}

const canonical = (name) => {
  const matches = aliases.get(key(name));
  return matches?.size === 1 ? [...matches][0] : null;
};

const GOALS = Object.freeze({
  hydration: { label: "Увлажнение", group: "reference.cosing.humectants", claims: ["literature.glycerin.hydration"] },
  barrier: { label: "Поддержка барьера", group: "reference.cosing.emollients", claims: ["literature.petrolatum.water-loss", "literature.panthenol.formula-barrier"] },
  appearance: { label: "Внешний вид кожи", claims: ["literature.niacinamide.appearance"] },
  cleansing: { label: "Очищение", group: "reference.cosing.cleansing", claims: [] }
});

const INPUT_REASONS = Object.freeze({
  skinType: "Учтён как сообщённый тип кожи; доказанной персональной переносимости по нему нет.",
  concerns: "Учтено сообщённое состояние; диагноз не устанавливается, клинических правил для свободного текста нет.",
  context: "Проверена необходимость уточнения применения после процедуры или по назначению специалиста.",
  goals: "Цели сопоставлены отдельно со справочными функциями и предметно проверенными утверждениями.",
  applicationArea: "Зона сопоставлена с подтверждённым назначением продукта и условиями источников.",
  allergyStatus: "Учитывается только сообщение пользователя; отсутствие известных аллергий не подтверждает переносимость.",
  allergens: "Сопоставлены точные названия и однозначные справочные синонимы; fuzzy-совпадения не используются.",
  previousReaction: "Учтена сообщённая реакция на этот или другой продукт; её причина не диагностируется.",
  invalidFields: "Часть данных не удалось интерпретировать; зависящие от них выводы не сформированы."
});

const approvedFinding = (finding) => finding?.review?.status === "approved"
  && finding?.evidenceStatus === "verified"
  && finding?.applicability?.status === "context_matches"
  && finding?.conclusionSupported === true;

export function buildPersonalContext(profile, productSafety) {
  const normalized = normalizeAnalysisProfile(profile);
  const context = {};
  const verified = productSafety.purposeStatus === "confirmed_manufacturer";
  if (normalized.applicationArea) context.applicationSite = normalized.applicationArea === "hair_or_scalp" ? "hair" : normalized.applicationArea;
  else if (verified && productSafety.applicationArea?.value) context.applicationSite = productSafety.applicationArea.value === "hair_or_scalp" ? "hair" : productSafety.applicationArea.value;
  if (verified && ["rinse_off", "leave_on"].includes(productSafety.exposure?.mode)) context.usage = productSafety.exposure.mode;
  if (verified && productSafety.format?.value) context.productForm = productSafety.format.value;
  return context;
}

function missingInputsByConclusion(profile, goalAssessments, formulaComplete) {
  const result = [];
  const tolerability = [];
  if (!profile.allergyStatus) tolerability.push("allergyStatus");
  if (profile.allergyStatus === "reported" && !profile.allergens.length) tolerability.push("allergens");
  if (!profile.previousReaction) tolerability.push("previousReaction");
  if (!formulaComplete) tolerability.push("completeFormula");
  if (tolerability.length) result.push({ conclusion: "tolerability", fields: unique(tolerability), effect: "Только персональная переносимость остаётся неизвестной." });
  for (const goal of goalAssessments) {
    if (goal.missingInputs.length) result.push({ conclusion: `goal:${goal.goal}`, fields: goal.missingInputs, effect: "Ограничен только вывод по этой цели." });
  }
  return result;
}

function goalAssessmentsFor({ profile, evidence, formulaComplete, purposeConfirmed, restrictions, precautions }) {
  return profile.goals.map((goalId) => {
    const definition = GOALS[goalId];
    const group = definition.group ? evidence.groups.find((item) => item.ruleId === definition.group) : null;
    const candidates = evidence.expertFindings.filter((finding) => definition.claims.includes(finding.ruleId));
    const approved = candidates.filter(approvedFinding);
    const missingInputs = unique([
      ...candidates.flatMap((finding) => finding.applicability?.missing || []),
      ...(!formulaComplete ? ["completeFormula"] : []),
      ...(!purposeConfirmed ? ["confirmedProductPurpose"] : []),
      ...(!approved.length ? ["approvedEvidence"] : [])
    ]);
    const evidenceStatus = approved.length ? "potential_match" : group?.items?.length ? "reference_only" : "insufficient_data";
    const applicationStatus = restrictions.length ? "restricted" : precautions.length ? "caution" : evidenceStatus === "potential_match" ? "potential_fit" : "insufficient_data";
    const ingredients = unique(group?.items || []);
    const description = evidenceStatus === "potential_match"
      ? `${definition.label}: есть предметно проверенное утверждение с подходящими условиями. Эффект и переносимость готового продукта для пользователя не подтверждены.`
      : evidenceStatus === "reference_only"
        ? `${definition.label}: найдены компоненты со справочной функцией (${ingredients.join(", ")}). Это не подтверждает эффект продукта для пользователя.`
        : `${definition.label}: достаточных данных для персонального вывода нет.`;
    return {
      goal: goalId,
      label: definition.label,
      evidenceStatus,
      applicationStatus,
      ingredients,
      referenceRuleId: group?.ruleId || null,
      expertRuleIds: approved.map((finding) => finding.ruleId),
      missingInputs,
      restrictionRuleIds: restrictions.map((item) => item.ruleId),
      precautionRuleIds: precautions.map((item) => item.ruleId),
      text: description
    };
  });
}

export function evaluatePersonalization({ profile, found, unknown, formulaScope, productSafety, evidence }) {
  const normalized = normalizeAnalysisProfile(profile);
  const profileProvided = hasPersonalProfile(profile);
  const restrictions = [];
  const precautions = [];
  const limitations = ["Индивидуальная безопасность и переносимость не установлены. Отсутствие совпадений не означает отсутствие риска."];
  const add = (target, ruleId, description, fields = [], details = {}) => target.push({
    ruleId,
    text: description,
    fields,
    ...details,
    basis: { type: "user_input_and_analysis", policy: "docs/C11_PERSONALIZATION_RULES.md", version: PERSONALIZATION_VERSION }
  });

  const medical = productSafety.shouldScoreAsCosmetic === false;
  if (medical) add(restrictions, "personal.non-cosmetic", "Обнаружены признаки лекарственного или процедурного средства. Персональный косметический подбор и схема применения не формируются.");
  if (normalized.previousReaction === "this_product") {
    add(restrictions, "personal.previous-reaction", "Вы сообщили о прошлой реакции на этот продукт. Сервис не формирует рекомендацию повторно начать применение и не устанавливает причину реакции.", ["previousReaction"]);
  } else if (normalized.previousReaction === "other_product") {
    add(precautions, "personal.other-reaction", "Ранее была реакция на другое средство. Причинный компонент не установлен; переносимость этого продукта не подтверждена.", ["previousReaction"]);
  }

  for (const name of normalized.allergens) {
    const identity = canonical(name);
    const matched = found.filter((item) => item.status === "confirmed" && !item.excludedFromScoring
      && (key(item.name) === key(name) || (identity && key(item.name) === identity)));
    if (matched.length) {
      add(restrictions, "personal.allergen-match", `В составе найден ${matched[0].name}, совпадающий с указанным вами аллергеном. Сервис не формирует рекомендацию применять этот продукт.`, ["allergens"], { input: name, ingredient: matched[0].name, match: "exact_or_registry_alias" });
    } else {
      add(precautions, identity ? "personal.allergen-not-found" : "personal.unresolved-allergen",
        identity
          ? `${name}: подтверждённого совпадения в разобранном составе нет. Это не исключает аллерген в нераспознанных позициях, Parfum, закрытых комплексах или другой версии формулы.`
          : `${name}: название аллергена не установлено однозначно. Уточните INCI; отсутствие совпадения не подтверждает безопасность.`,
        ["allergens"], { input: name });
    }
  }
  if (normalized.allergyStatus === "reported" && !normalized.allergens.length) {
    add(precautions, "personal.missing-allergens", "Указана аллергия, но компоненты не перечислены. Для сопоставления нужны точные названия INCI.", ["allergyStatus", "allergens"]);
  }

  const area = productSafety.applicationArea;
  if (normalized.applicationArea && area?.value && normalized.applicationArea !== area.value) {
    const confirmed = productSafety.purposeStatus === "confirmed_manufacturer";
    add(confirmed ? restrictions : precautions, "personal.area-mismatch", "Выбранная зона нанесения отличается от зоны в данных о продукте. Необходимо сверить назначение и инструкцию для этой зоны.", ["applicationArea"], { requested: normalized.applicationArea, productArea: area.value, source: area.source });
  }
  if (normalized.context === "после процедуры" || normalized.context === "назначил косметолог") {
    add(precautions, "personal.procedure-context", "Указан процедурный контекст или назначение специалиста. Без сведений о процедуре и её ограничениях персональная схема не определяется.", ["context"]);
  }
  if (normalized.concerns || normalized.skinType === "чувствительная") {
    add(precautions, "personal.unverified-clinical-context", "Указаны чувствительность или особенности состояния кожи. В текущей базе нет предметно проверенных правил, подтверждающих применимость продукта в этом контексте.", [normalized.concerns ? "concerns" : "skinType"]);
  }
  if (normalized.invalidFields?.length) add(precautions, "personal.invalid-profile", "Некоторые поля профиля имеют неподдерживаемое значение. Зависимые от них выводы не сформированы.", normalized.invalidFields);

  const formulaComplete = formulaScope === "full" && !unknown.length && !found.some((item) => item.excludedFromScoring);
  if (profileProvided && !formulaComplete) add(precautions, "personal.incomplete-formula", "Полнота или распознавание состава ограничены. Персональная совместимость не установлена.");
  const purposeConfirmed = productSafety.purposeStatus === "confirmed_manufacturer";
  if (profileProvided && !purposeConfirmed) add(precautions, "personal.unconfirmed-purpose", "Назначение производителя не подтверждено; персональное применение требует проверки этикетки.");

  for (const finding of evidence.expertFindings) {
    if (!profileProvided || finding.review?.status !== "approved" || finding.evidenceStatus !== "verified"
      || finding.riskAssessment?.status !== "assessed" || finding.applicability?.status === "not_applicable") continue;
    for (const statement of finding.riskAssessment.statements || []) {
      add(precautions, "personal.reviewed-precaution", statement, [], { expertRuleId: finding.ruleId, sources: finding.basis });
    }
  }

  const missingFields = ["skinType", "context", "applicationArea", "allergyStatus", "previousReaction"].filter((field) => !normalized[field]);
  if (!normalized.goals.length) missingFields.push("goals");
  if (missingFields.length) limitations.push("Профиль заполнен не полностью. Пропуск ограничивает только зависящий от поля вывод и не считается отрицанием аллергий, реакций или ограничений.");

  const goalAssessments = goalAssessmentsFor({ profile: normalized, evidence, formulaComplete, purposeConfirmed, restrictions, precautions });
  const missingByConclusion = missingInputsByConclusion(normalized, goalAssessments, formulaComplete);
  const approvedGoalRuleIds = new Set(goalAssessments.flatMap((goal) => goal.expertRuleIds));
  const relevantApprovedClaims = evidence.expertFindings.filter((finding) => approvedGoalRuleIds.has(finding.ruleId) && approvedFinding(finding));
  if (normalized.goals.length && !relevantApprovedClaims.length) limitations.push("Нет предметно одобренных экспертных утверждений для выбранных целей; персональная польза не подтверждена.");

  const potentialBenefits = restrictions.length ? [] : relevantApprovedClaims.map((finding) => ({
    ruleId: finding.ruleId,
    text: finding.text,
    basis: finding.basis,
    productEffectConfirmed: false,
    applicationAdviceAllowed: false,
    precautionRuleIds: precautions.map((item) => item.ruleId)
  }));
  const goalReferences = goalAssessments.map((goal) => ({
    goal: goal.goal,
    label: goal.label,
    ingredients: goal.ingredients,
    ruleId: goal.referenceRuleId,
    status: goal.evidenceStatus,
    applicationStatus: goal.applicationStatus,
    text: goal.text
  }));

  const status = restrictions.length
    ? "blocked"
    : !profileProvided
      ? "general_only"
      : precautions.length
        ? "review_required"
        : potentialBenefits.length
          ? "potential_fit"
          : "insufficient_data";
  const summary = {
    blocked: "Есть установленное для этого ввода ограничение. Положительная рекомендация начать применение не сформирована.",
    general_only: "Профиль не указан. Показан общий справочный разбор; персональная применимость не оценена.",
    review_required: "Есть предосторожность, требующая уточнения. Независимые справочные сведения сохранены, но рекомендация начать применение не сформирована.",
    potential_fit: "Есть ограниченное соответствие выбранной цели по предметно проверенному основанию; безопасность, переносимость и эффект готового продукта не гарантированы.",
    insufficient_data: "Профиль учтён, но данных недостаточно, чтобы подтвердить персональную пользу и переносимость."
  }[status];

  return {
    version: PERSONALIZATION_VERSION,
    status,
    summary,
    profileProvided,
    profile: normalized,
    profileProvenance: profileProvided ? "request_session_only" : "not_provided",
    safetyEstablished: false,
    applicationAdviceAllowed: false,
    usedInputs: Object.entries(normalized)
      .filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value))
      .map(([field, value]) => ({ field, value, reason: INPUT_REASONS[field] })),
    missingFields,
    missingInputsByConclusion: missingByConclusion,
    restrictions,
    precautions,
    potentialBenefits,
    goalAssessments,
    goalReferences,
    limitations: unique(limitations)
  };
}
