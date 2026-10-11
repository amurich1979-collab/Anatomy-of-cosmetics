import { createHash } from "node:crypto";
import fs from "node:fs";

export const FORMULA_SYSTEMS_ENGINE_VERSION = "1.1.0";
export const FORMULA_ASSESSMENT_SCHEMA_VERSION = "1.0";

const rulesText = fs.readFileSync(new URL("../../data/formula-system-rules.c08.json", import.meta.url), "utf8");
const ruleSet = JSON.parse(rulesText);
const ruleSetHash = createHash("sha256").update(rulesText).digest("hex");

const SYSTEM_IDS = Object.freeze([
  "water_phase", "humectants", "emollients", "lipid_phase", "oils",
  "barrier_lipids", "emulsification", "surfactants", "rheology",
  "preservation", "fragrance", "actives", "uv_filters"
]);

const LABELS = Object.freeze(Object.fromEntries(
  ruleSet.rules
    .filter((rule) => rule.status === "source_backed_draft")
    .map((rule) => [rule.systemId, rule.label])
));

const GROUPS = Object.freeze({
  humectants: ["reference.cosing.humectants"],
  emollients: ["reference.cosing.emollients"],
  emulsification: ["reference.cosing.emulsifiers", "reference.cosing.stabilizers"],
  surfactants: ["reference.cosing.surfactants", "reference.cosing.cleansing"],
  rheology: ["reference.cosing.rheology"],
  preservation: ["reference.cosing.preservatives"],
  uv_filters: ["reference.cosing.uv_filters"]
});

const REQUIRED_INPUTS = Object.freeze({
  water_phase: ["waterPercentage", "emulsionStructure"],
  humectants: ["ingredientConcentrations", "rinseOffStatus", "finishedProductHydrationTest"],
  emollients: ["ingredientConcentrations", "sensoryTest", "finishedProductTolerance"],
  lipid_phase: ["phasePercentages", "phaseDistribution", "rawMaterialSpecifications"],
  oils: ["oilProcessing", "batchOxidation", "fattyAcidProfile"],
  barrier_lipids: ["lipidRatios", "deliverySystem", "finishedProductBarrierTest"],
  emulsification: ["phaseRatio", "processParameters", "stabilityTest"],
  surfactants: ["totalSurfactantConcentration", "pH", "contactTime", "mildnessTest"],
  rheology: ["polymerGrade", "neutralization", "pH", "measuredViscosity"],
  preservation: ["waterActivity", "pH", "packaging", "microbiologicalAssessment"],
  fragrance: ["fragranceDisclosure", "allergenConcentrations", "individualTolerance"],
  actives: ["activeConcentration", "vehicle", "stability", "finishedProductTest"],
  uv_filters: ["filterConcentrations", "dispersion", "SPFTest", "UVATest", "waterResistanceTest"]
});

const SYSTEM_LIMITS = Object.freeze({
  water_phase: "Доля воды и тип эмульсии по порядку INCI не устанавливаются.",
  humectants: "Справочная функция не подтверждает степень или длительность увлажнения готового средства.",
  emollients: "Сенсорика, комедогенность и переносимость готового средства не установлены.",
  lipid_phase: "Массовая доля и распределение компонентов по фазам неизвестны.",
  oils: "INCI не раскрывает обработку, окисление и качество партии масла.",
  barrier_lipids: "Наличие липидов не подтверждает их оптимальное соотношение или восстановление барьера.",
  emulsification: "Наличие эмульгаторов или стабилизаторов не подтверждает устойчивость эмульсии.",
  surfactants: "Мягкость смеси и риск раздражения нельзя установить без концентраций, pH, экспозиции и испытаний.",
  rheology: "Фактические pH, вязкость и устойчивость готовой формулы не измерены.",
  preservation: "Наличие консервантов не подтверждает микробиологическую защиту или результат challenge-test.",
  fragrance: "Состав Parfum, индивидуальная переносимость и гипоаллергенность продукта не установлены.",
  actives: "Наличие названия актива не подтверждает концентрацию, стабильность или эффект готового средства.",
  uv_filters: "Список фильтров не определяет SPF, UVA-защиту, водостойкость или продолжительность действия продукта."
});

const EXPERT_SYSTEMS = Object.freeze({
  "literature.glycerin.hydration": "humectants",
  "literature.petrolatum.water-loss": "emollients",
  "literature.niacinamide.appearance": "actives",
  "literature.panthenol.formula-barrier": "actives"
});

const LIPID_CLASSES = Object.freeze({
  petrolatum: "углеводородный эмолент",
  "paraffinum liquidum": "углеводородный эмолент",
  squalane: "углеводородный эмолент",
  dimethicone: "силикон",
  cyclopentasiloxane: "силикон",
  "caprylic/capric triglyceride": "триглицерид",
  "cetearyl ethylhexanoate": "эфир",
  "isopropyl isostearate": "эфир",
  "cera alba": "воск",
  "candelilla wax": "воск"
});

const ACTIVE_CANDIDATES = new Set([
  "niacinamide", "panthenol", "allantoin", "retinol", "retinal", "retinyl palmitate",
  "salicylic acid", "glycolic acid", "lactic acid", "mandelic acid", "azelaic acid",
  "gluconolactone", "lactobionic acid", "bakuchiol"
]);

const PURPOSE_STATUS = Object.freeze({
  confirmed_manufacturer: "manufacturer_declared",
  source_backed: "source_reported",
  hypothesis: "hypothesis",
  safety_flag: "hypothesis",
  uncertain: "conflicting"
});

const key = (value) => String(value || "").normalize("NFKC").trim().toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ");
const unique = (values) => [...new Set(values.filter(Boolean))];
const sorted = (values) => [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
const shortHash = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 12);

function normalizedScope(value) {
  const scope = key(value).replace(/\s/g, "_");
  if (scope === "active_ingredients_only") return "active_only";
  return ["full", "partial", "active_only", "unknown"].includes(scope) ? scope : "unknown";
}

function exactIngredient(item) {
  return item?.status === "confirmed" && !item?.excludedFromScoring && item?.category !== "proprietary_complex";
}

function ingredientId(item, occurrences) {
  const identity = key(item.name || item.input || "unknown");
  const occurrence = (occurrences.get(identity) || 0) + 1;
  occurrences.set(identity, occurrence);
  return `ingredient:${shortHash(identity)}:${occurrence}`;
}

function referenceRuleIds(item) {
  return new Set((item.findings || []).filter((finding) => finding.kind === "reference").map((finding) => finding.ruleId));
}

function hasGroup(item, systemId) {
  const ids = referenceRuleIds(item);
  return (GROUPS[systemId] || []).some((ruleId) => ids.has(ruleId));
}

function isOil(item) {
  const name = key(item.name);
  return /\boil$/.test(name) && !/^peg-\d+\s+/.test(name);
}

function isBarrierLipid(item) {
  return /^(?:ceramide\b|cholesterol$|linoleic acid$|palmitic acid$|stearic acid$)/i.test(String(item.name || ""));
}

function lipidClass(item) {
  return LIPID_CLASSES[key(item.name)]
    || (isBarrierLipid(item) ? "барьерный липид" : isOil(item) ? "масло по наименованию INCI" : null);
}

function isFragrance(item) {
  const name = key(item.name);
  if (name === "parfum" || name === "fragrance") return true;
  const refs = referenceRuleIds(item);
  return refs.has("reference.cosing.perfuming")
    && !["reference.cosing.humectants", "reference.cosing.emollients", "reference.cosing.solvents", "reference.cosing.surfactants"]
      .some((ruleId) => refs.has(ruleId));
}

function hasActiveCandidate(item) {
  return ACTIVE_CANDIDATES.has(key(item.name))
    || (item.findings || []).some((finding) => finding.kind === "expert" && EXPERT_SYSTEMS[finding.ruleId] === "actives");
}

function belongsTo(item, systemId) {
  if (!exactIngredient(item)) return false;
  if (systemId === "water_phase") return key(item.name) === "aqua" && referenceRuleIds(item).has("reference.cosing.solvents");
  if (systemId === "oils") return isOil(item);
  if (systemId === "barrier_lipids") return isBarrierLipid(item);
  if (systemId === "lipid_phase") return Boolean(lipidClass(item));
  if (systemId === "fragrance") return isFragrance(item);
  if (systemId === "actives") return hasActiveCandidate(item);
  return hasGroup(item, systemId);
}

function contextDescription(systemId, productSafety, item) {
  const type = productSafety?.type || "unknown_cosmetic";
  const exposure = productSafety?.exposure?.mode || "unknown";
  if (systemId === "surfactants") {
    if (["cleanser", "hair_scalp"].includes(type) && exposure === "rinse_off") return "В подтверждённом смываемом контексте возможна очищающая роль.";
    return "Справочная функция ПАВ не устанавливает очищающее назначение этого продукта.";
  }
  if (systemId === "emulsification") return "Компоненты могут участвовать в эмульгировании или стабилизации, но устройство основы не подтверждено.";
  if (systemId === "preservation") return "Компоненты имеют справочную консервирующую функцию; эффективность системы не испытана этим разбором.";
  if (systemId === "fragrance") return "Компоненты относятся к отдушке или парфюмирующей функции; переносимость не установлена.";
  if (systemId === "lipid_phase") return `Справочно отнесён к классу «${lipidClass(item)}»; фактическое распределение по фазам и доля неизвестны.`;
  if (systemId === "actives") return "Идентифицирован кандидат в активные компоненты; его роль, концентрация и эффект в готовом средстве не подтверждены.";
  if (systemId === "uv_filters") return type === "spf"
    ? "В заявленном солнцезащитном продукте возможна роль фильтра; показатели готового средства требуют отдельных испытаний."
    : "Справочная функция фильтра не назначает продукту солнцезащитное применение.";
  return "Показана возможная роль по справочной идентичности или функции; эффект готового средства не подтверждён.";
}

function makeSourceRegistry() {
  const map = new Map();
  const add = (source) => {
    if (!source?.id || map.has(source.id)) return source?.id || null;
    map.set(source.id, source);
    return source.id;
  };
  add({
    id: "source:c08-spec",
    type: "technical_document",
    url: null,
    artifactRef: "docs/C08_SYSTEM_RULES.md",
    title: "C08. Правила функциональных систем",
    locator: "version 0.1.0",
    checkedAt: ruleSet.date,
    retrievedAt: null,
    publishedAt: ruleSet.date,
    jurisdiction: null,
    productVersion: null,
    checkedScope: "engineering_policy_and_review_draft",
    contentHash: ruleSetHash,
    review: ruleSet.review
  });
  return { add, values: () => [...map.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

function inputSource(source, role, sources) {
  if (!source || (!source.url && !source.name && !source.type)) return null;
  const id = `source:input:${role}:${shortHash(`${source.type || ""}|${source.name || ""}|${source.url || ""}|${source.retrievedAt || ""}`)}`;
  return sources.add({
    id,
    type: source.type || "input_source",
    url: source.url || null,
    artifactRef: null,
    title: source.name || role,
    locator: role,
    checkedAt: source.retrievedAt || null,
    retrievedAt: source.retrievedAt || null,
    publishedAt: null,
    jurisdiction: null,
    productVersion: null,
    checkedScope: role,
    contentHash: null,
    review: null
  });
}

function registrySource(item, sources) {
  const basis = (item.findings || []).flatMap((finding) => finding.kind === "reference" ? (finding.basis || []) : [])
    .find((entry) => entry.type === "local_registry");
  if (!basis) return "source:c08-spec";
  const id = `source:registry:${String(basis.sha256 || "unknown").slice(0, 12)}`;
  return sources.add({
    id,
    type: "ingredient_reference",
    url: basis.recordSourceUrl || null,
    artifactRef: basis.file || "data/inci-registry.json",
    title: "Локальный INCI-справочник",
    locator: `record=${basis.record || item.name}`,
    checkedAt: basis.checkedAt || null,
    retrievedAt: basis.checkedAt || null,
    publishedAt: null,
    jurisdiction: null,
    productVersion: basis.sourceVersion || basis.registryVersion || null,
    checkedScope: "identity_and_reference_function_only",
    contentHash: basis.sha256 || null,
    review: { status: "reference_only" }
  });
}

function expertSources(finding, sources) {
  return (finding.basis || []).map((basis, index) => {
    const fingerprint = `${finding.ruleId}|${basis.url || basis.id || basis.title || index}|${basis.locator || ""}`;
    const id = `source:claim:${shortHash(fingerprint)}`;
    sources.add({
      id,
      type: basis.type || "study",
      url: basis.url || null,
      artifactRef: basis.artifactRef || null,
      title: basis.title || finding.ruleId,
      locator: basis.locator || null,
      checkedAt: basis.checkedAt || null,
      retrievedAt: basis.retrievedAt || null,
      publishedAt: basis.publishedAt || null,
      jurisdiction: basis.jurisdiction || null,
      productVersion: basis.productVersion || null,
      checkedScope: basis.readScope || basis.scope || "claim_conditions_only",
      contentHash: basis.contentHash || null,
      review: finding.review || null
    });
    return { sourceId: id, locator: basis.locator || null };
  });
}

function overallStatus({ productSafety, scope, unknown, ingredients, systems }) {
  if (productSafety?.shouldScoreAsCosmetic === false) return "out_of_scope";
  if (!ingredients.length) return "needs_input";
  if (scope !== "full" || unknown.length || ingredients.some((item) => item.identityStatus !== "confirmed")) return "partial";
  const supported = systems.filter((system) => system.ingredientRefs.length);
  if (productSafety?.purposeStatus === "confirmed_manufacturer" && supported.length
      && supported.every((system) => system.status === "described")) return "described";
  return "partial";
}

function mapPurpose(productSafety) {
  const type = productSafety?.type || "unknown_cosmetic";
  const status = productSafety?.purposeStatus === "uncertain"
    ? (productSafety?.conflicts?.length ? "conflicting" : "unknown")
    : PURPOSE_STATUS[productSafety?.purposeStatus] || "unknown";
  return {
    productClass: productSafety?.shouldScoreAsCosmetic === false ? "medical_or_procedural" : type === "unknown_cosmetic" ? "unknown" : "cosmetic",
    category: type,
    format: productSafety?.format?.value || null,
    applicationAreas: productSafety?.applicationArea?.value ? [productSafety.applicationArea.value] : [],
    exposure: productSafety?.exposure?.mode || "unknown",
    targetSkin: null,
    status,
    claimIds: ["claim:purpose"]
  };
}

function mapPersonalFit(personalization) {
  const status = {
    blocked: "restricted",
    review_required: "caution",
    limited: "insufficient_data",
    insufficient_data: "insufficient_data",
    potential_fit: "potential_fit",
    general_only: "general_only"
  }[personalization?.status] || "general_only";
  return {
    status,
    goalMatchClaimIds: [],
    precautionClaimIds: [],
    restrictionClaimIds: [],
    unknownClaimIds: [],
    missingInputs: personalization?.missingFields || [],
    missingInputsByConclusion: personalization?.missingInputsByConclusion || [],
    usedProfileFields: (personalization?.usedInputs || []).map((entry) => entry.field)
  };
}

export function validateFormulaAssessment(value) {
  const errors = [];
  if (!value || typeof value !== "object") return { valid: false, errors: ["assessment must be an object"] };
  if (value.schemaVersion !== FORMULA_ASSESSMENT_SCHEMA_VERSION) errors.push("unsupported schemaVersion");
  if (!new Set(["described", "partial", "needs_input", "out_of_scope"]).has(value.status)) errors.push("invalid status");
  if (!Array.isArray(value.systems) || value.systems.length !== SYSTEM_IDS.length) errors.push("all 13 systems are required");
  if (Array.isArray(value.systems) && value.systems.map((system) => system.id).join("|") !== SYSTEM_IDS.join("|")) errors.push("system order or IDs are invalid");
  const claims = new Map((value.claims || []).map((claim) => [claim.id, claim]));
  const ingredients = new Set((value.ingredients || []).map((ingredient) => ingredient.id));
  const sources = new Set((value.sources || []).map((source) => source.id));
  if (claims.size !== (value.claims || []).length) errors.push("claim IDs must be unique");
  if (ingredients.size !== (value.ingredients || []).length) errors.push("ingredient IDs must be unique");
  if (sources.size !== (value.sources || []).length) errors.push("source IDs must be unique");
  if (value.formulaRef?.sourceId && !sources.has(value.formulaRef.sourceId)) errors.push("formulaRef.sourceId is unresolved");
  for (const system of value.systems || []) {
    if (!new Set(["described", "reference_only", "not_identified", "insufficient_data", "not_applicable"]).has(system.status)) errors.push(`${system.id}: invalid status`);
    for (const ref of system.ingredientRefs || []) if (!ingredients.has(ref)) errors.push(`${system.id}: unresolved ingredientRef ${ref}`);
    for (const field of ["roleClaimIds", "assessmentClaimIds", "cautionClaimIds", "unknownClaimIds"]) {
      for (const ref of system[field] || []) if (!claims.has(ref)) errors.push(`${system.id}: unresolved ${field} ${ref}`);
    }
  }
  for (const ingredient of value.ingredients || []) {
    for (const ref of [...(ingredient.roleClaimIds || []), ...(ingredient.limitationClaimIds || [])]) {
      if (!claims.has(ref)) errors.push(`${ingredient.id}: unresolved claimRef ${ref}`);
    }
  }
  for (const filter of value.photoprotection?.filters || []) {
    if (!ingredients.has(filter.ingredientRef)) errors.push(`photoprotection: unresolved ingredientRef ${filter.ingredientRef}`);
    for (const ref of filter.spectrumClaimIds || []) if (!claims.has(ref)) errors.push(`photoprotection: unresolved claimRef ${ref}`);
  }
  const quantitative = new Map((value.quantitative || []).map((item) => [item.id, item]));
  if (quantitative.size !== (value.quantitative || []).length) errors.push("quantitative IDs must be unique");
  for (const item of value.quantitative || []) {
    if (!new Set(["ingredient", "trade_mixture", "finished_product"]).has(item.subject?.kind)) errors.push(`${item.id}: invalid quantitative subject`);
    if (["ingredient", "trade_mixture"].includes(item.subject?.kind) && !ingredients.has(item.subject?.id)) errors.push(`${item.id}: unresolved quantitative ingredientRef`);
    if (!new Set(["manufacturer_declared", "user_reported", "test_reported", "unknown"]).has(item.basisStatus)) errors.push(`${item.id}: invalid basisStatus`);
    if (item.sourceId && !sources.has(item.sourceId)) errors.push(`${item.id}: unresolved quantitative source`);
    if (item.formulaId !== value.formulaRef?.formulaId) errors.push(`${item.id}: formulaId mismatch`);
  }
  for (const ingredient of value.ingredients || []) {
    for (const ref of ingredient.quantitative || []) if (!quantitative.has(ref)) errors.push(`${ingredient.id}: unresolved quantitativeRef ${ref}`);
  }
  for (const metric of value.photoprotection?.productMetrics || []) {
    if (!quantitative.has(metric.quantitativeRef)) errors.push(`photoprotection: unresolved quantitativeRef ${metric.quantitativeRef}`);
    if (!claims.has(metric.claimId)) errors.push(`photoprotection: unresolved claimRef ${metric.claimId}`);
    if (metric.sourceId && !sources.has(metric.sourceId)) errors.push(`photoprotection: unresolved source ${metric.sourceId}`);
  }
  for (const ref of value.photoprotection?.instructionClaimIds || []) if (!claims.has(ref)) errors.push(`photoprotection: unresolved instruction claimRef ${ref}`);
  for (const ref of value.photoprotection?.unknownClaimIds || []) if (!claims.has(ref)) errors.push(`photoprotection: unresolved claimRef ${ref}`);
  for (const duration of value.duration || []) {
    if (duration.sourceId && !sources.has(duration.sourceId)) errors.push(`${duration.id}: unresolved duration source`);
    if (duration.claimId && !claims.has(duration.claimId)) errors.push(`${duration.id}: unresolved duration claim`);
    for (const ref of duration.instructionClaimIds || []) if (!claims.has(ref)) errors.push(`${duration.id}: unresolved instruction claim`);
  }
  for (const field of ["irritationClaimIds", "sensitizationClaimIds", "manufacturerHypoallergenicClaimIds", "unknownClaimIds"]) {
    for (const ref of value.tolerability?.[field] || []) if (!claims.has(ref)) errors.push(`tolerability: unresolved ${field} ${ref}`);
  }
  if (!new Set(["general_only", "potential_fit", "caution", "restricted", "insufficient_data"]).has(value.personalFit?.status)) errors.push("personalFit: invalid status");
  for (const field of ["goalMatchClaimIds", "precautionClaimIds", "restrictionClaimIds", "unknownClaimIds"]) {
    for (const ref of value.personalFit?.[field] || []) if (!claims.has(ref)) errors.push(`personalFit: unresolved ${field} ${ref}`);
  }
  for (const ref of [...(value.summary?.claimIds || []), ...(value.limitations || [])]) if (!claims.has(ref)) errors.push(`unresolved claimRef ${ref}`);
  for (const claim of value.claims || []) for (const basis of claim.basis || []) if (basis.sourceId && !sources.has(basis.sourceId)) errors.push(`${claim.id}: unresolved source ${basis.sourceId}`);
  return { valid: errors.length === 0, errors };
}

export function buildFormulaAssessment({
  found = [], unknown = [], productSafety = {}, formulaScope = "unknown", formulaEvidence = {},
  productEvidence = {}, personalization = {}, evidenceVersions = {}
} = {}) {
  const scope = normalizedScope(formulaScope);
  const occurrences = new Map();
  const sources = makeSourceRegistry();
  const formulaSourceId = inputSource(formulaEvidence?.source, "formula", sources);
  const purposeSource = productSafety?.purposeEvidence?.source || productEvidence?.source;
  const purposeSourceId = inputSource(purposeSource, "product_purpose", sources);
  const claims = [];
  const addClaim = (claim) => {
    if (!claims.some((existing) => existing.id === claim.id)) claims.push(claim);
    return claim.id;
  };
  const formulaIngredients = [...found, ...unknown]
    .sort((left, right) => (left.position || Number.MAX_SAFE_INTEGER) - (right.position || Number.MAX_SAFE_INTEGER))
    .map((item) => {
      const id = ingredientId(item, occurrences);
      const confirmed = exactIngredient(item);
      return {
        id,
        input: item.input || item.name || null,
        canonicalName: confirmed ? item.name : null,
        position: Number.isInteger(item.position) ? item.position : null,
        identityStatus: confirmed ? "confirmed" : item.status === "suggested" || item.suggested_match ? "suggested" : "unknown",
        identityKind: item.category === "proprietary_complex" ? "proprietary_complex" : confirmed ? "ingredient" : "unresolved",
        suggestedMatch: confirmed ? null : item.suggested_match || null,
        provenance: item.provenance || null,
        roleClaimIds: [],
        limitationClaimIds: [],
        quantitative: []
      };
    });
  const incomplete = scope !== "full" || formulaIngredients.some((item) => item.identityStatus !== "confirmed");
  const itemByRef = new Map();
  [...found, ...unknown]
    .sort((left, right) => (left.position || Number.MAX_SAFE_INTEGER) - (right.position || Number.MAX_SAFE_INTEGER))
    .forEach((item, index) => itemByRef.set(formulaIngredients[index].id, item));

  addClaim({
    id: "claim:purpose", subject: "product", kind: "source_fact",
    text: productSafety?.intendedUse || "Назначение продукта не подтверждено.",
    verification: productSafety?.purposeStatus === "confirmed_manufacturer" ? "source_checked" : "unverified",
    basis: [
      { sourceId: "source:c08-spec", locator: "Назначение и контекст до системных ролей", ruleId: "C08-context", ruleVersion: ruleSet.version, inputRefs: [] },
      ...(purposeSourceId ? [{ sourceId: purposeSourceId, locator: "product purpose metadata", ruleId: "input.product-purpose", ruleVersion: null, inputRefs: [] }] : [])
    ],
    scope: { productType: productSafety?.type || "unknown_cosmetic", exposure: productSafety?.exposure?.mode || "unknown" },
    limitations: ["Подтверждение назначения не подтверждает эффективность продукта."], missingInputs: [], review: null
  });
  addClaim({
    id: "claim:global-limit", subject: "formula", kind: "unknown",
    text: "INCI не подтверждает проценты, стабильность, микробиологическую защиту, гипоаллергенность, качество партии или эффективность готового продукта.",
    verification: "source_checked",
    basis: [{ sourceId: "source:c08-spec", locator: "Сквозные границы C08", ruleId: "C08-global", ruleVersion: ruleSet.version, inputRefs: [] }],
    scope: { formulaScope: scope }, limitations: [], missingInputs: ["finishedProductEvidence"], review: null
  });
  if (incomplete) addClaim({
    id: "claim:formula-incomplete", subject: "formula", kind: "unknown",
    text: "Полнота или распознавание состава ограничены; отсутствие системы по доступному фрагменту не подтверждается.",
    verification: "source_checked",
    basis: [{ sourceId: "source:c08-spec", locator: "Правила неполного состава", ruleId: "C08-scope", ruleVersion: ruleSet.version, inputRefs: formulaIngredients.filter((item) => item.identityStatus !== "confirmed").map((item) => item.id) }],
    scope: { formulaScope: scope }, limitations: [], missingInputs: ["completeFormula"], review: null
  });

  const systems = SYSTEM_IDS.map((systemId) => {
    const componentRefs = formulaIngredients.filter((ingredient) => {
      const item = itemByRef.get(ingredient.id);
      return belongsTo(item, systemId);
    }).map((ingredient) => ingredient.id);
    const roleClaimIds = [];
    const assessmentClaimIds = [];
    const cautionClaimIds = [];
    const unknownClaimIds = [];

    for (const ingredientRef of componentRefs) {
      const item = itemByRef.get(ingredientRef);
      const sourceId = registrySource(item, sources);
      const id = `claim:${systemId}:role:${shortHash(key(item.name))}`;
      roleClaimIds.push(addClaim({
        id, subject: `system:${systemId}`, kind: "interpretation",
        text: `${item.name}: ${contextDescription(systemId, productSafety, item)}`,
        verification: "review_required",
        basis: [{ sourceId, locator: `record=${item.name}`, ruleId: `C09.${systemId}.role`, ruleVersion: FORMULA_SYSTEMS_ENGINE_VERSION, inputRefs: [ingredientRef] }],
        scope: { productType: productSafety?.type || "unknown_cosmetic", exposure: productSafety?.exposure?.mode || "unknown" },
        limitations: [SYSTEM_LIMITS[systemId]], missingInputs: [], review: null
      }));
      const ingredient = formulaIngredients.find((entry) => entry.id === ingredientRef);
      ingredient.roleClaimIds = unique([...ingredient.roleClaimIds, id]);

      for (const finding of item.findings || []) {
        if (finding.kind !== "expert" || EXPERT_SYSTEMS[finding.ruleId] !== systemId) continue;
        const approved = finding.review?.status === "approved" && finding.evidenceStatus === "verified"
          && finding.applicability?.status === "context_matches" && finding.conclusionSupported === true;
        if (!approved) continue;
        const claimId = `claim:${systemId}:assessment:${shortHash(finding.ruleId)}`;
        assessmentClaimIds.push(addClaim({
          id: claimId, subject: `system:${systemId}`, kind: "interpretation", text: finding.text,
          verification: "expert_reviewed",
          basis: expertSources(finding, sources).map((basis) => ({ ...basis, ruleId: finding.ruleId, ruleVersion: finding.version, inputRefs: [ingredientRef] })),
          scope: finding.conditions || {}, limitations: finding.limitations || [], missingInputs: [], review: finding.review
        }));
      }
    }

    const cautionId = `claim:${systemId}:limit`;
    cautionClaimIds.push(addClaim({
      id: cautionId, subject: `system:${systemId}`, kind: "unknown", text: SYSTEM_LIMITS[systemId],
      verification: "source_checked",
      basis: [{ sourceId: "source:c08-spec", locator: `rule systemId=${systemId}`, ruleId: `C08.${systemId}`, ruleVersion: ruleSet.version, inputRefs: componentRefs }],
      scope: { productType: productSafety?.type || "unknown_cosmetic", exposure: productSafety?.exposure?.mode || "unknown" },
      limitations: [], missingInputs: REQUIRED_INPUTS[systemId], review: null
    }));

    if (!componentRefs.length && incomplete) unknownClaimIds.push("claim:formula-incomplete");
    const status = productSafety?.shouldScoreAsCosmetic === false
      ? (componentRefs.length ? "reference_only" : "not_applicable")
      : componentRefs.length
        ? (assessmentClaimIds.length && !incomplete ? "described" : "reference_only")
        : incomplete ? "insufficient_data" : "not_identified";
    return {
      id: systemId,
      label: LABELS[systemId],
      status,
      ingredientRefs: componentRefs,
      roleClaimIds: sorted(roleClaimIds),
      assessmentClaimIds: sorted(assessmentClaimIds),
      cautionClaimIds: sorted(cautionClaimIds),
      unknownClaimIds: sorted(unknownClaimIds),
      requiredInputs: [...REQUIRED_INPUTS[systemId]]
    };
  });

  const status = overallStatus({ productSafety, scope, unknown, ingredients: formulaIngredients, systems });
  const systemClaimIds = systems.flatMap((system) => system.assessmentClaimIds.length ? system.assessmentClaimIds : system.roleClaimIds).slice(0, 5);
  const formulaAssessment = {
    schemaVersion: FORMULA_ASSESSMENT_SCHEMA_VERSION,
    status,
    formulaRef: {
      scope,
      formulaId: formulaEvidence?.formulaId || formulaEvidence?.productId || null,
      sourceId: formulaSourceId,
      market: formulaEvidence?.market || null,
      version: formulaEvidence?.version || null,
      confirmation: formulaEvidence?.confirmation || "unverified",
      unresolvedIngredientRefs: formulaIngredients.filter((item) => item.identityStatus !== "confirmed").map((item) => item.id)
    },
    purpose: mapPurpose(productSafety),
    summary: { claimIds: unique(["claim:purpose", ...systemClaimIds, "claim:global-limit", ...(incomplete ? ["claim:formula-incomplete"] : [])]) },
    systems,
    ingredients: formulaIngredients,
    quantitative: [],
    photoprotection: {
      filters: systems.find((system) => system.id === "uv_filters").ingredientRefs.map((ingredientRef) => ({ ingredientRef, spectrumClaimIds: [] })),
      productMetrics: [], instructionClaimIds: [],
      unknownClaimIds: ["claim:uv_filters:limit"]
    },
    duration: [],
    tolerability: {
      irritationClaimIds: [], sensitizationClaimIds: [], manufacturerHypoallergenicClaimIds: [],
      unknownClaimIds: ["claim:global-limit", "claim:fragrance:limit"]
    },
    personalFit: mapPersonalFit(personalization),
    claims: claims.sort((left, right) => left.id.localeCompare(right.id)),
    sources: sources.values(),
    limitations: unique(["claim:global-limit", ...(incomplete ? ["claim:formula-incomplete"] : [])]),
    versions: {
      engine: FORMULA_SYSTEMS_ENGINE_VERSION,
      ruleSet: ruleSet.version,
      ruleSetSha256: ruleSetHash,
      ruleSetReviewStatus: ruleSet.review?.status || "unknown",
      ruleSetTextsEnabled: Boolean(ruleSet.runtimeEligible && ruleSet.review?.status === "approved"),
      knowledge: evidenceVersions.knowledge || null,
      knowledgeSha256: evidenceVersions.knowledgeSha256 || null,
      registrySha256: evidenceVersions.registrySha256 || null
    }
  };
  const validation = validateFormulaAssessment(formulaAssessment);
  if (!validation.valid) throw new TypeError(`Invalid formula assessment: ${validation.errors.join("; ")}`);
  return formulaAssessment;
}

export function getFormulaSystemRuleSetInfo() {
  return { version: ruleSet.version, sha256: ruleSetHash, review: structuredClone(ruleSet.review), runtimeEligible: ruleSet.runtimeEligible };
}
