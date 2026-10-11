import { createHash } from "node:crypto";
import fs from "node:fs";
import { getInciRegistrySnapshot } from "./ingredientSources/inciRegistry.js";
import { evaluateClaimContext, matchConditions, validateKnowledge } from "./expertKnowledge.js";

export const EXPERT_RULES_VERSION = "2.0.0";
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

export function validateExpertKnowledge(data) {
  return validateKnowledge(data, registry);
}

const validationErrors = validateExpertKnowledge(knowledge);
if (validationErrors.length) throw new TypeError(`Invalid expert knowledge: ${validationErrors.join("; ")}`);

export function claimApplicability(conditions, context = {}) {
  return matchConditions(conditions, context);
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
    const candidates = excluded || nonCosmetic ? [] : (claimsByIngredient.get(key(item.name)) || []).filter((claim) => claim.review.status !== "rejected"
      && (!claim.lifecycle || claim.lifecycle.status === "active"));
    for (const claim of candidates) {
      const applicability = evaluateClaimContext(claim, context, dataset);
      const review = dataset.schemaVersion === "2.0" ? claim.review : { ...claim.review, status: "pending", legacyStatus: claim.review.status };
      const evidenceStatus = dataset.schemaVersion === "2.0" ? claim.evidenceStatus : "review_required";
      const reviewLabel = review.status === "approved" ? "Проверено предметным специалистом" : "Требует предметной проверки";
      const applicabilityLabel = applicability.status === "not_applicable" ? "Условия не соответствуют" : applicability.status === "conditional" ? "Применимость не установлена" : "Контекст соответствует; эффект продукта не подтвержден";
      itemFindings.push({
        ...structuredClone(claim), kind: "expert", review: structuredClone(review), evidenceStatus,
        applicability, conclusionSupported: applicability.conclusionSupported, productEffectConfirmed: false,
        unknownReasons: applicability.unknownReasons,
        statusLabel: evidenceStatus === "verified" ? "Проверено" : evidenceStatus === "review_required" ? "Требует предметной проверки" : "Недостаточно данных",
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
