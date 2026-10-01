import { createHash } from "node:crypto";
import fs from "node:fs";
import { getInciRegistrySnapshot } from "./ingredientSources/inciRegistry.js";

export const EXPERT_RULES_VERSION = "1.1.0";
const key = (value) => String(value || "").trim().toUpperCase();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const registrySnapshot = getInciRegistrySnapshot();
const registry = new Map(registrySnapshot.records.map((row) => [key(row.name), row]));
const registryHash = registrySnapshot.metadata.registrySha256;
const claimsText = fs.readFileSync(new URL("../../data/expert-claims.json", import.meta.url), "utf8");
const knowledge = JSON.parse(claimsText);
const POLICY_BASIS = [{ type: "engine_policy", file: "docs/EXPERT_RULES.md", version: EXPERT_RULES_VERSION }];
const registryLimit = "Локальный справочник функций, не доказательство эффективности или безопасности продукта; актуальность записи отдельно не проверена.";

// These are labels for registry functions, not clinical effects or product destinations.
const FUNCTION_GROUPS = Object.freeze({
  HUMECTANT: ["humectants", "Увлажняющие компоненты"],
  EMOLLIENT: ["emollients", "Смягчающие компоненты"],
  SOLVENT: ["solvents", "Растворители"],
  EMULSIFYING: ["emulsifiers", "Эмульгаторы"],
  SURFACTANT: ["surfactants", "Поверхностно-активные компоненты"],
  CLEANSING: ["cleansing", "Очищающие компоненты"],
  PRESERVATIVE: ["preservatives", "Консерванты"],
  PERFUMING: ["perfuming", "Парфюмирующие компоненты"],
  "VISCOSITY CONTROLLING": ["rheology", "Регуляторы вязкости"],
  "EMULSION STABILISING": ["stabilizers", "Стабилизаторы эмульсии"],
  "SKIN CONDITIONING": ["skin_conditioning", "Кондиционирование кожи (справочная функция)"],
  "HAIR CONDITIONING": ["hair_conditioning", "Кондиционирование волос (справочная функция)"],
  "UV FILTER": ["uv_filters", "УФ-фильтры (без оценки SPF)"],
  "UV ABSORBER": ["uv_absorbers", "Поглотители УФ (не подтверждает SPF)"],
  ANTIOXIDANT: ["antioxidants", "Антиоксиданты (справочная функция)"],
  SMOOTHING: ["smoothing", "Сглаживающие компоненты (справочная функция)"]
});

const nonEmpty = (value) => typeof value === "string" && Boolean(value.trim());
const date = (value) => nonEmpty(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function validateExpertKnowledge(data) {
  const errors = [];
  if (data?.schemaVersion !== "1.1" || !nonEmpty(data?.version)) errors.push("Invalid knowledge version");
  if (!Array.isArray(data?.sources) || !Array.isArray(data?.claims)) return [...errors, "sources and claims must be arrays"];
  const sources = new Set();
  for (const source of data.sources) {
    if (!source || typeof source !== "object") { errors.push("Invalid source record"); continue; }
    if (!nonEmpty(source.id) || sources.has(source.id)) errors.push("Duplicate/missing source id");
    sources.add(source.id);
    if (!/^https:\/\//.test(source.url || "") || !nonEmpty(source.title) || !date(source.checkedAt)
      || source.type !== "primary_study_abstract" || source.checkedScope !== "abstract_only" || !nonEmpty(source.context)) errors.push(`Invalid source ${source.id}`);
  }
  const ids = new Set();
  for (const claim of data.claims) {
    if (!claim || typeof claim !== "object") { errors.push("Invalid claim record"); continue; }
    if (!nonEmpty(claim.ruleId) || ids.has(claim.ruleId)) errors.push("Duplicate/missing ruleId");
    ids.add(claim.ruleId);
    for (const field of ["version", "ingredient", "role", "possibleContribution"]) {
      if (!nonEmpty(claim[field])) errors.push(`${claim.ruleId}: missing ${field}`);
    }
    if (!registry.has(key(claim.ingredient))) errors.push(`${claim.ruleId}: unknown canonical ingredient`);
    if (!date(claim.checkedAt)) errors.push(`${claim.ruleId}: missing check date`);
    if (!['verified', 'review_required', 'insufficient_data'].includes(claim.evidenceStatus)) errors.push(`${claim.ruleId}: invalid evidence status`);
    if (!Array.isArray(claim.limitations) || !claim.limitations.length || !claim.limitations.every(nonEmpty)) errors.push(`${claim.ruleId}: limitations required`);
    if (!Array.isArray(claim.basis) || !claim.basis.length || !claim.basis.every((ref) => sources.has(ref?.sourceId) && nonEmpty(ref?.locator))) errors.push(`${claim.ruleId}: unresolved basis`);
    const review = claim.review;
    if (!["pending", "approved", "rejected"].includes(review?.status)) errors.push(`${claim.ruleId}: invalid review`);
    if (review?.status === "approved" && (!nonEmpty(review.reviewer) || !date(review.reviewedAt))) errors.push(`${claim.ruleId}: approval requires reviewer and date`);
    if (review?.status === "approved" && claim.evidenceStatus !== "verified") errors.push(`${claim.ruleId}: approved claim must be verified`);
    if (review?.status === "pending" && claim.evidenceStatus !== "review_required") errors.push(`${claim.ruleId}: pending claim must require review`);
    const risk = claim.riskAssessment;
    if (!risk || !['assessed', 'insufficient_data'].includes(risk.status)
      || !Array.isArray(risk.statements) || !risk.statements.every(nonEmpty)
      || !Array.isArray(risk.limitations) || !risk.limitations.length || !risk.limitations.every(nonEmpty)) {
      errors.push(`${claim.ruleId}: risk assessment is incomplete`);
    }
    if (!claim.conditions || Array.isArray(claim.conditions) || typeof claim.conditions !== "object" || !Object.keys(claim.conditions).length) errors.push(`${claim.ruleId}: conditions required`);
    for (const [field, value] of Object.entries(claim.conditions || {})) {
      const valid = field === "applicationSite" ? ["skin", "face", "body", "hair"].includes(value)
        : field === "usage" ? ["leave_on", "rinse_off"].includes(value)
          : field === "concentrationPercent" ? typeof value === "number" && value > 0 && value <= 100
            : field === "productForm" && nonEmpty(value);
      if (!valid) errors.push(`${claim.ruleId}: unsupported condition ${field}`);
    }
  }
  return errors;
}

const validationErrors = validateExpertKnowledge(knowledge);
if (validationErrors.length) throw new TypeError(`Invalid expert knowledge: ${validationErrors.join("; ")}`);

export function claimApplicability(conditions, context = {}) {
  const missing = [];
  const conflicts = [];
  for (const [field, expected] of Object.entries(conditions)) {
    const actual = context[field];
    if (actual == null || actual === "unknown") missing.push(field);
    else if (!(field === "applicationSite" && expected === "skin" && ["face", "body"].includes(actual)) && actual !== expected) conflicts.push(field);
  }
  return { status: conflicts.length ? "not_applicable" : missing.length ? "conditional" : "context_matches", missing, conflicts };
}

function guard(ruleId, text, input = {}) {
  return { ruleId, version: EXPERT_RULES_VERSION, kind: "limitation", text, evidenceStatus: "insufficient_data", statusLabel: "Недостаточно данных", basis: [...structuredClone(POLICY_BASIS), { type: "analysis_input", ...input }], review: { status: "engineering_policy" } };
}

export function evaluateExpertRules({ found = [], unknown = [], assessment, productSafety, context = {} }, dataset = knowledge) {
  const errors = validateExpertKnowledge(dataset);
  if (errors.length) throw new TypeError(errors.join("; "));
  const findings = [];
  const groups = new Map();
  const claimsByIngredient = new Map();
  for (const claim of dataset.claims) {
    const name = key(claim.ingredient);
    if (!claimsByIngredient.has(name)) claimsByIngredient.set(name, []);
    claimsByIngredient.get(name).push(claim);
  }
  const nonCosmetic = productSafety?.shouldScoreAsCosmetic === false;
  findings.push(guard("guard.product-evidence", "Эффективность, риск раздражения, качество сырья, концентрации, pH и SPF не оцениваются по списку INCI. Нужны проверяемые данные готового продукта.", { reason: assessment.reason }));
  findings.push(guard("guard.unknown-risk", "Отсутствие экспертных данных не означает отсутствие риска. Индивидуальная переносимость не установлена."));
  if (nonCosmetic) findings.push(guard("guard.non-cosmetic", "Есть признаки процедурного или лекарственного средства: это не обычная косметическая формула. Не использовать как ежедневное уходовое средство без проверки назначения. Сверьте инструкцию производителя; рекомендации по применению не сформированы.", { classification: productSafety.type, method: "existing_classifier_heuristic" }));
  if (unknown.length) findings.push(guard("guard.unresolved", "Есть неподтвержденные названия. Возможные совпадения не используются для экспертных выводов.", { ingredients: unknown.map((item) => item.input) }));
  if (assessment.reason !== "unvalidated_scoring_method") findings.push(guard("guard.formula-scope", "Полнота данных ограничивает вывод о всей формуле.", { reason: assessment.reason }));
  const classificationText = productSafety?.purposeStatus === "confirmed_manufacturer"
    ? "Назначение взято из подтвержденной карточки производителя; применимость зависит от точного варианта продукта и актуальности источника."
    : productSafety?.purposeStatus === "source_backed"
      ? "Назначение взято из выбранной карточки стороннего источника и не считается подтверждением производителя."
      : productSafety?.purposeStatus === "safety_flag"
        ? "Защитная классификация основана на сигнальных ингредиентах; точное медицинское назначение и схема применения не определяются."
        : productSafety?.purposeStatus === "hypothesis"
          ? "Тип продукта является гипотезой по названию и функциональным признакам состава; назначение производителя не подтверждено."
          : "Назначение не подтверждено из-за отсутствия данных или противоречия источников и состава.";
  findings.push({
    ...guard("guard.classification", classificationText, { classification: productSafety?.type, purposeStatus: productSafety?.purposeStatus }),
    basis: [
      ...structuredClone(POLICY_BASIS),
      {
        type: productSafety?.purposeEvidence?.basis || "classification_rule",
        file: "src/services/productClassifier.js",
        classification: productSafety?.type,
        purposeStatus: productSafety?.purposeStatus,
        source: productSafety?.purposeEvidence?.source || null,
        ingredients: found.map((item) => item.input)
      }
    ]
  });

  const ingredients = found.map((item) => {
    const itemFindings = [];
    const excluded = item.excludedFromScoring || item.category === "proprietary_complex" || item.status !== "confirmed";
    const row = excluded ? null : registry.get(key(item.name));
    if (excluded) itemFindings.push(guard("guard.undisclosed", "Комплекс производителя или неподтвержденное название: свойства и концентрации не определяются, экспертная оценка исключена.", { ingredient: item.input }));
    const roles = [];
    for (const fn of row?.functions || []) {
      const functionName = key(fn).replace(/[_-]/g, " ").replace(/\s+/g, " ");
      const [groupId, role] = FUNCTION_GROUPS[functionName] || [`unmapped:${functionName}`, `${functionName} (справочная функция)`];
      const ruleId = `reference.cosing.${groupId}`;
      const finding = {
        ruleId, version: EXPERT_RULES_VERSION, kind: "reference", ingredient: item.name,
        role, text: `${item.name}: ${role}. Это функция компонента, а не назначение готового средства.`,
        basis: [{
          type: "local_registry", file: "data/inci-registry.json", sha256: registryHash,
          registryVersion: registrySnapshot.metadata.registryVersion, record: row.name, function: fn,
          source: registrySnapshot.metadata.source.type, recordSourceUrl: registrySnapshot.metadata.source.url,
          checkedAt: registrySnapshot.metadata.source.retrievedAt,
          sourceExportedAt: registrySnapshot.metadata.source.exportedAt,
          sourceVersion: registrySnapshot.metadata.source.version,
          recordProvenance: row.provenance,
          cas: row.cas,
          restrictions: row.restrictions
        }],
        limitations: [registryLimit], review: { status: "reference_only" }
      };
      roles.push(role);
      itemFindings.push(finding);
      if (!groups.has(groupId)) groups.set(groupId, { role, items: [], ruleId, kind: "reference", limitations: [registryLimit] });
      groups.get(groupId).items.push(item.name);
    }
    const candidates = excluded || nonCosmetic ? [] : (claimsByIngredient.get(key(item.name)) || []).filter((claim) => claim.review.status !== "rejected");
    for (const claim of candidates) {
      const applicability = claimApplicability(claim.conditions, context);
      const reviewLabel = claim.review.status === "approved" ? "Проверено предметным специалистом" : "Требует предметной проверки";
      const applicabilityLabel = applicability.status === "not_applicable" ? "Условия не соответствуют" : applicability.status === "conditional" ? "Применимость не установлена" : "Контекст соответствует; эффект продукта не подтвержден";
      itemFindings.push({
        ...structuredClone(claim), kind: "expert", applicability, productEffectConfirmed: false,
        statusLabel: claim.evidenceStatus === "verified" ? "Проверено" : claim.evidenceStatus === "review_required" ? "Требует предметной проверки" : "Недостаточно данных",
        text: `${item.name}: ${reviewLabel}. ${applicabilityLabel}. ${claim.possibleContribution} ${claim.limitations.join(" ")}`,
        basis: claim.basis.map((ref) => ({ ...structuredClone(dataset.sources.find((source) => source.id === ref.sourceId)), locator: ref.locator }))
      });
    }
    if (!excluded && !candidates.length) itemFindings.push(guard("guard.no-expert-claim", "Проверяемого экспертного утверждения нет; польза и риск не установлены.", { ingredient: item.name }));
    findings.push(...itemFindings);
    return {
      ...item, roles, category: item.category === "proprietary_complex" ? item.category : roles[0] || "Справочный компонент",
      ru: roles[0] || "Справочный компонент", benefits: [], risks: [], best_for: [], avoid_for: [], skin: [], cautions: [],
      quality_score: null, ingredient_quality_score: null, quality_label: "не оценивается",
      quality_note: "Качество сырья и эффективность продукта не определяются по названию ингредиента.",
      evidence_level: "not_assessed", riskAssessment: { status: "not_assessed", ruleId: "guard.unknown-risk" },
      dataSource: excluded ? item.dataSource : row ? "INCI registry" : "legacy_identity",
      referenceType: excluded ? item.referenceType : row ? "inci_registry" : null,
      findings: itemFindings,
      note: [roles.length ? `Справочные функции локального CosIng: ${roles.join(", ")}. ${registryLimit}` : "", ...itemFindings.filter((finding) => finding.kind !== "reference").map((finding) => `${finding.text}${finding.kind === "expert" ? ` Источник: ${finding.basis.map((ref) => ref.url).join(", ")}` : ""}`)].filter(Boolean).join(" "),
      concentrationAssessment: { ...item.concentrationAssessment, ruleId: "guard.product-evidence" }
    };
  });
  findings.push({
    ruleId: "reference.formula.functions", version: EXPERT_RULES_VERSION, kind: "reference",
    text: `Функциональный разбор: ${groups.size} справочных групп. Функции компонентов не подтверждают эффект или назначение продукта.`,
    basis: [{ type: "derived_reference", ruleIds: [...groups.values()].map((group) => group.ruleId), registrySha256: registryHash }],
    limitations: [registryLimit], review: { status: "reference_only" }
  });
  const limitations = findings.filter((finding) => finding.kind === "limitation");
  const expertFindings = findings.filter((finding) => finding.kind === "expert");
  return {
    versions: {
      rules: EXPERT_RULES_VERSION,
      knowledge: dataset.version,
      knowledgeSha256: dataset === knowledge ? hash(claimsText) : hash(JSON.stringify(dataset)),
      registrySha256: registryHash,
      localAdditionsSha256: registrySnapshot.metadata.localAdditionsSha256
    },
    findings, ingredients, groups: [...groups.values()].map((group) => ({ ...group, items: [...new Set(group.items)] })),
    limitations, expertFindings,
    coverage: {
      identified: found.filter((item) => !item.excludedFromScoring && item.status === "confirmed").length,
      withClaims: ingredients.filter((item) => item.findings.some((f) => f.kind === "expert")).length,
      withReviewedClaims: ingredients.filter((item) => item.findings.some((f) => f.kind === "expert" && f.review.status === "approved")).length,
      nameRecognition: { status: "measured", count: found.filter((item) => !item.excludedFromScoring && item.status === "confirmed").length },
      expertExplanation: {
        status: "measured_separately",
        count: ingredients.filter((item) => item.findings.some((f) => f.kind === "expert")).length,
        reviewedCount: ingredients.filter((item) => item.findings.some((f) => f.kind === "expert" && f.review.status === "approved")).length
      }
    },
    finishedProduct: Object.fromEntries(["concentration", "pH", "SPF", "efficacy", "irritationRisk", "rawMaterialQuality"].map((field) => [field, { value: null, status: "not_assessed", ruleId: "guard.product-evidence", reason: "requires_verified_finished_product_evidence" }]))
  };
}
