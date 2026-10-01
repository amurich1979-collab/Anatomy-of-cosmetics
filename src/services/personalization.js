import { normalizeAnalysisProfile, hasPersonalProfile } from "../../public/analysis-profile.js";
import { getInciRegistrySnapshot } from "./ingredientSources/inciRegistry.js";

export const PERSONALIZATION_VERSION = "1.0.0";
const key = (x) => String(x || "").normalize("NFKC").trim().toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ");
const aliases = new Map();
for (const row of getInciRegistrySnapshot().records) {
  for (const name of [row.name, ...(row.aliases || [])]) {
    const k = key(name);
    if (!aliases.has(k)) aliases.set(k, new Set());
    aliases.get(k).add(key(row.name));
  }
}
const canonical = (name) => {
  const matches = aliases.get(key(name));
  return matches?.size === 1 ? [...matches][0] : null;
};
const GOALS = {
  hydration: { label: "Увлажнение", group: "reference.cosing.humectants", claims: ["literature.glycerin.hydration"] },
  barrier: { label: "Поддержка барьера", group: "reference.cosing.emollients", claims: ["literature.petrolatum.water-loss", "literature.panthenol.formula-barrier"] },
  appearance: { label: "Внешний вид кожи", claims: ["literature.niacinamide.appearance"] },
  cleansing: { label: "Очищение", group: "reference.cosing.cleansing", claims: [] }
};
const INPUT_REASONS = {
  skinType: "Учтён как сообщённый тип кожи; доказанной персональной переносимости по нему нет.",
  concerns: "Учтено сообщённое состояние; диагноз не устанавливается, клинических правил для такого текста нет.",
  context: "Проверена необходимость уточнения применения после процедуры или по назначению специалиста.",
  goals: "Сопоставлены с функциями компонентов и проверяемыми экспертными сведениями.",
  applicationArea: "Сопоставлена с зоной продукта и условиями экспертных сведений.",
  allergyStatus: "Учитывается только сообщение пользователя; отсутствие известных аллергий не подтверждает переносимость.",
  allergens: "Сопоставлены точные названия и однозначные справочные синонимы; неопределённые совпадения требуют проверки.",
  previousReaction: "Учтена указанная реакция на этот или другой продукт; её причина не диагностируется.",
  invalidFields: "Часть данных не удалось интерпретировать; персональная рекомендация приостановлена."
};

export function buildPersonalContext(profile, productSafety) {
  const p = normalizeAnalysisProfile(profile);
  const context = {};
  const verified = productSafety.purposeStatus === "confirmed_manufacturer";
  if (p.applicationArea) context.applicationSite = p.applicationArea === "hair_or_scalp" ? "hair" : p.applicationArea;
  else if (verified && productSafety.applicationArea?.value) context.applicationSite = productSafety.applicationArea.value === "hair_or_scalp" ? "hair" : productSafety.applicationArea.value;
  if (verified && ["rinse_off", "leave_on"].includes(productSafety.exposure?.mode)) context.usage = productSafety.exposure.mode;
  // Generic format labels cannot establish the specific formulation used in a study.
  if (verified && productSafety.format?.value) context.productForm = productSafety.format.value;
  return context;
}

export function evaluatePersonalization({ profile, found, unknown, formulaScope, productSafety, evidence }) {
  const p = normalizeAnalysisProfile(profile);
  const profileProvided = hasPersonalProfile(profile);
  const restrictions = [];
  const precautions = [];
  const limitations = ["Индивидуальная безопасность и переносимость не установлены. Отсутствие совпадений не означает отсутствие риска."];
  const add = (target, ruleId, text, fields = [], details = {}) => target.push({
    ruleId, text, fields, ...details,
    basis: { type: "user_input_and_analysis", policy: "docs/PERSONALIZATION.md", version: PERSONALIZATION_VERSION }
  });
  const medical = productSafety.shouldScoreAsCosmetic === false;
  if (medical) add(restrictions, "personal.non-cosmetic", "Обнаружены признаки лекарственного или процедурного средства. Персональный косметический подбор и схема применения не формируются.");
  if (p.previousReaction === "this_product") add(restrictions, "personal.previous-reaction", "Вы указали прошлую реакцию на этот продукт. Повторное применение не рекомендуется этим сервисом; причину реакции нужно уточнить у специалиста.", ["previousReaction"]);
  else if (p.previousReaction === "other_product") add(precautions, "personal.other-reaction", "Ранее была реакция на другое средство. Причинный компонент не установлен; переносимость этого продукта не подтверждена.", ["previousReaction"]);

  for (const name of p.allergens) {
    const identity = canonical(name);
    const matched = found.filter((x) => x.status === "confirmed" && !x.excludedFromScoring && (key(x.name) === key(name) || (identity && key(x.name) === identity)));
    if (matched.length) {
      add(restrictions, "personal.allergen-match", `В составе найден ${matched[0].name}, указанный вами как подтверждённый аллерген. Сервис не рекомендует применение этого продукта.`, ["allergens"], { input: name, ingredient: matched[0].name, match: "exact_or_registry_alias" });
    } else {
      add(precautions, identity ? "personal.allergen-not-found" : "personal.unresolved-allergen",
        identity ? `${name}: подтверждённого совпадения в разобранном составе нет. Это не исключает аллерген в нераспознанных позициях, комплексах или другой версии формулы.` : `${name}: название аллергена не установлено однозначно. Уточните INCI; отсутствие совпадения не подтверждает безопасность.`, ["allergens"], { input: name });
    }
  }
  if (p.allergyStatus === "reported" && !p.allergens.length) add(precautions, "personal.missing-allergens", "Указана подтверждённая аллергия, но компоненты не перечислены. Нужны их точные названия INCI.", ["allergyStatus", "allergens"]);
  const area = productSafety.applicationArea;
  if (p.applicationArea && area?.value && p.applicationArea !== area.value) {
    const confirmed = productSafety.purposeStatus === "confirmed_manufacturer";
    add(confirmed ? restrictions : precautions, "personal.area-mismatch", "Выбранная зона нанесения отличается от зоны в данных о продукте. Необходимо сверить назначение и инструкцию для этой зоны.", ["applicationArea"], { requested: p.applicationArea, productArea: area.value, source: area.source });
  }
  if (p.context === "после процедуры" || p.context === "назначил косметолог") add(precautions, "personal.procedure-context", "Указан процедурный контекст или назначение специалиста. Без сведений о процедуре и её ограничениях персональная схема не определяется.", ["context"]);
  if (p.concerns || p.skinType === "чувствительная") add(precautions, "personal.unverified-clinical-context", "Указаны чувствительность или особенности состояния кожи. В текущей базе нет предметно проверенных правил, позволяющих подтвердить применимость продукта в этом контексте.", [p.concerns ? "concerns" : "skinType"]);
  if (p.invalidFields?.length) add(precautions, "personal.invalid-profile", "Некоторые поля профиля имеют неподдерживаемое значение. Уточните их перед персональным подбором.", p.invalidFields);
  if (profileProvided && (formulaScope !== "full" || unknown.length || found.some((x) => x.excludedFromScoring))) add(precautions, "personal.incomplete-formula", "Полнота или распознавание состава ограничены. Персональная совместимость не установлена.");
  if (profileProvided && productSafety.purposeStatus !== "confirmed_manufacturer") add(precautions, "personal.unconfirmed-purpose", "Назначение производителя не подтверждено; персональное применение требует проверки этикетки.");
  for (const claim of evidence.expertFindings) {
    if (!profileProvided || claim.review.status !== "approved" || claim.evidenceStatus !== "verified"
      || claim.riskAssessment?.status !== "assessed" || claim.applicability.status === "not_applicable") continue;
    for (const statement of claim.riskAssessment.statements) {
      add(precautions, "personal.reviewed-precaution", statement, [], { expertRuleId: claim.ruleId, sources: claim.basis });
    }
  }

  const missingFields = ["skinType", "context", "applicationArea", "allergyStatus", "previousReaction"].filter((field) => !p[field]);
  if (!p.goals.length) missingFields.push("goals");
  if (missingFields.length) limitations.push("Профиль заполнен не полностью. Неуказанные сведения не считаются отрицанием аллергий, реакций или ограничений.");
  const relevantClaims = evidence.expertFindings.filter((x) => p.goals.some((goal) => GOALS[goal].claims.includes(x.ruleId)));
  if (!relevantClaims.some((x) => x.review.status === "approved" && x.evidenceStatus === "verified")) limitations.push("Нет предметно одобренных экспертных утверждений для выбранных целей; персональная польза не подтверждена.");
  const potentialBenefits = restrictions.length || precautions.length || missingFields.length ? [] : relevantClaims
    .filter((x) => x.review.status === "approved" && x.evidenceStatus === "verified" && x.applicability.status === "context_matches")
    .map((x) => ({ ruleId: x.ruleId, text: x.text, basis: x.basis, productEffectConfirmed: false }));
  const goalReferences = restrictions.length ? [] : p.goals.map((goal) => {
    const group = evidence.groups.find((x) => x.ruleId === GOALS[goal].group);
    return { goal, label: GOALS[goal].label, ingredients: group?.items || [], ruleId: group?.ruleId || null,
      text: group ? `${GOALS[goal].label}: найдены компоненты со справочной функцией (${group.items.join(", ")}). Это не подтверждает эффект продукта для вас.` : `${GOALS[goal].label}: достаточных данных для персонального вывода нет.` };
  });
  const status = restrictions.length ? "blocked" : !profileProvided ? "general_only" : precautions.length ? "review_required" : "limited";
  const summary = {
    blocked: "Есть ограничения: сервис не рекомендует применение по этому разбору.",
    general_only: "Профиль не указан. Показан общий справочный разбор; персональная применимость не оценена.",
    review_required: "Персональная применимость требует уточнения. Рекомендация начать применение не сформирована.",
    limited: "Профиль учтён, но данных недостаточно, чтобы подтвердить персональную пользу и переносимость."
  }[status];
  return { version: PERSONALIZATION_VERSION, status, summary, profileProvided, profile: p,
    safetyEstablished: false, applicationAdviceAllowed: false,
    usedInputs: Object.entries(p).filter(([, v]) => Array.isArray(v) ? v.length : Boolean(v)).map(([field, value]) => ({ field, value, reason: INPUT_REASONS[field] })),
    missingFields, restrictions, precautions, potentialBenefits, goalReferences, limitations };
}
