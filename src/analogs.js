import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeComposition } from "./analyzer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const productsPath = path.join(dataDir, "products.json");
const productIndexPath = path.join(dataDir, "product-index.json");
const productDetailsCachePath = path.join(dataDir, "product-details-cache.json");

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}

function uniqueProducts() {
  const byId = new Map();
  [...readJson(productsPath, []), ...readJson(productIndexPath, []), ...readJson(productDetailsCachePath, [])].forEach((product) => {
    if (product?.id && product?.composition) byId.set(product.id, { ...byId.get(product.id), ...product });
  });
  return [...byId.values()];
}

const setOf = (items) => new Set(items.filter(Boolean).map(normalize));
const intersection = (a, b) => [...a].filter((item) => b.has(item));
const difference = (a, b) => [...a].filter((item) => !b.has(item));
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  const common = intersection(a, b).length;
  return common / (a.size + b.size - common);
}

function ingredientGroup(analysis, pattern) {
  return setOf((analysis.found || [])
    .filter((item) => pattern.test(`${item.category} ${(item.roles || []).join(" ")}`))
    .map((item) => item.name));
}
const activeSet = (analysis) => ingredientGroup(analysis, /актив|кислота|ретиноид|spf|uv|пептид|антиоксидант|aha|bha|pha/i);
const supportSet = (analysis) => ingredientGroup(analysis, /увлажн|humectant|барьер|эмолент|окклюзив|керамид|липид|силикон|масло/i);

function scoreDistance(target, candidate) {
  const fields = ["hydration_score", "barrier_score", "active_score", "irritation_risk"];
  if (fields.some((field) => !Number.isFinite(target[field]) || !Number.isFinite(candidate[field]))) return 0;
  const distance = fields.reduce((sum, field) => sum + Math.abs(target[field] - candidate[field]), 0);
  return Math.max(0, 1 - distance / 400);
}

function isDemo(product) {
  const text = normalize(`${product.id || ""} ${product.name || ""} ${product.brand || ""} ${product.market || ""} ${product.sourceType || ""}`);
  return String(product.id || "").startsWith("demo-") || /\bdemo\b|\bmvp demo\b|демо/.test(text)
    || String(product.sourceUrl || "").startsWith("internal://verified-demo");
}

function normalizedScope(value) {
  const scope = normalize(value).replaceAll(" ", "_");
  if (["full", "full_label_inci", "full_label_inci_from_photo", "complete"].includes(scope)) return "full";
  if (/active.*only|только.*актив/.test(scope)) return "active_only";
  if (["partial", "incomplete"].includes(scope)) return "partial";
  return "unknown";
}

function formulaSufficiency(product, explicitScope) {
  const scope = normalizedScope(explicitScope || product?.compositionScope);
  if (scope === "full") return { status: "sufficient", scope: "full", basis: "explicit_full_scope" };
  if (["partial", "active_only"].includes(scope)) return { status: "insufficient", scope, basis: "explicit_incomplete_scope" };
  const composition = String(product?.composition || "").trim();
  const reported = String(product?.ingredients_text || "").trim();
  if (composition && reported && composition === reported && product?.hasComposition === true) {
    return { status: "reported_full", scope: "reported_full", basis: "source_reported_ingredients_text" };
  }
  return { status: "unknown", scope: "unknown", basis: "formula_completeness_not_confirmed" };
}

function catalogEvidence(product) {
  return {
    identificationStatus: "confirmed",
    name: product.name || "",
    category: product.category || "",
    description: product.description || "",
    useInstructions: product.useInstructions || product.instructions || "",
    source: { name: product.source || "Каталог продукта", type: product.sourceType || "catalog", url: product.sourceUrl || "" }
  };
}

function purposeCompatibility(target, candidate) {
  const left = target.productSafety || {};
  const right = candidate.productSafety || {};
  if (!left.shouldScoreAsCosmetic || !right.shouldScoreAsCosmetic) return { ok: false, reason: "non_cosmetic_product" };
  if (left.type === "unknown_cosmetic" || right.type === "unknown_cosmetic") return { ok: false, reason: "purpose_unknown" };
  if (left.type !== right.type) return { ok: false, reason: "purpose_mismatch" };
  const leftArea = left.applicationArea?.value || null;
  const rightArea = right.applicationArea?.value || null;
  if (leftArea && rightArea && leftArea !== rightArea) return { ok: false, reason: "application_area_mismatch" };
  if (leftArea && !rightArea) return { ok: false, reason: "candidate_application_area_unknown" };
  const leftExposure = left.exposure?.mode || "unknown";
  const rightExposure = right.exposure?.mode || "unknown";
  if (leftExposure !== "unknown" && rightExposure !== leftExposure) {
    return { ok: false, reason: rightExposure === "unknown" ? "candidate_exposure_unknown" : "exposure_mismatch" };
  }
  return { ok: true, reason: null };
}

function personalCompatibility(candidate) {
  if (!candidate.personalization?.profileProvided) return { ok: true, reason: null };
  if (candidate.personalization.restrictions?.length) return { ok: false, reason: "personal_restriction" };
  const blockingPrecautions = new Set([
    "personal.incomplete-formula", "personal.unconfirmed-purpose", "personal.area-mismatch",
    "personal.invalid-profile", "personal.missing-allergens", "personal.unresolved-allergen"
  ]);
  if (candidate.personalization.precautions?.some((item) => blockingPrecautions.has(item.ruleId))) {
    return { ok: false, reason: "personal_data_requires_review" };
  }
  return { ok: true, reason: null };
}

const validSourceReference = (source) => Boolean(source && typeof source === "object" && /^https?:\/\//i.test(String(source.url || "")));

function priceEvidence(product) {
  const raw = product.priceEvidence;
  const amount = Number(raw?.amount);
  const volume = Number(raw?.volume?.value);
  const unit = normalize(raw?.volume?.unit);
  if (!(amount > 0) || !raw?.currency || !(volume > 0) || !unit || !raw?.observedAt || !validSourceReference(raw?.source)) {
    return { status: "unknown", label: "Цена неизвестна: нет сопоставимой цены с объёмом, датой и источником." };
  }
  return { status: "known", amount, currency: String(raw.currency).toUpperCase(), volume: { value: volume, unit },
    observedAt: raw.observedAt, source: raw.source, unitPrice: amount / volume,
    label: `${amount} ${String(raw.currency).toUpperCase()} за ${volume} ${unit}` };
}

function comparePrices(targetProduct, candidateProduct) {
  const target = priceEvidence(targetProduct || {});
  const candidate = priceEvidence(candidateProduct || {});
  if (target.status !== "known" || candidate.status !== "known" || target.currency !== candidate.currency || target.volume.unit !== candidate.volume.unit) {
    return { status: "unknown", target, candidate, label: "Нельзя подтвердить, что аналог дешевле: сопоставимых цен нет." };
  }
  const deltaPercent = Math.round(((candidate.unitPrice - target.unitPrice) / target.unitPrice) * 100);
  return { status: deltaPercent < 0 ? "cheaper" : deltaPercent > 0 ? "more_expensive" : "same_unit_price", deltaPercent, target, candidate,
    label: deltaPercent < 0 ? `Цена за ${target.volume.unit} ниже на ${Math.abs(deltaPercent)}% по указанным источникам.`
      : deltaPercent > 0 ? `Цена за ${target.volume.unit} выше на ${deltaPercent}% по указанным источникам.`
        : `Цена за ${target.volume.unit} совпадает по указанным источникам.` };
}

function availabilityEvidence(product) {
  const raw = product.availabilityEvidence;
  const country = normalize(raw?.country || raw?.market);
  const status = normalize(raw?.status);
  const isRussia = ["ru", "rf", "russia", "russian federation", "россия", "рф"].includes(country);
  if (!isRussia || !["in stock", "out of stock", "available", "unavailable"].includes(status)
    || !raw?.checkedAt || !validSourceReference(raw?.source)) {
    return { status: "unknown", label: "Наличие в РФ неизвестно: нет актуальной проверки с датой и источником." };
  }
  const available = ["in stock", "available"].includes(status);
  return { status: available ? "available" : "unavailable", checkedAt: raw.checkedAt, source: raw.source,
    label: available ? "Наличие в РФ подтверждено источником." : "Источник сообщает об отсутствии в РФ." };
}

function statusResult(status, reason, extra = {}) {
  const messages = {
    source_formula_incomplete: "Аналоги не предлагаются: полный состав исходного продукта не подтверждён.",
    source_purpose_unknown: "Аналоги не предлагаются: назначение исходного продукта не подтверждено.",
    source_not_cosmetic: "Аналоги косметики не предлагаются для лекарственного или процедурного средства.",
    source_personal_restriction: "Подбор аналогов остановлен из-за персонального ограничения.",
    no_compatible_products: "В текущих данных нет совместимых продуктов с достаточным составом и подтверждённым назначением."
  };
  return { status, reason, message: messages[reason] || "Подбор аналогов недоступен.", alternatives: [], ...extra };
}

export function findFormulaAlternativesDetailed({ text, profile = {}, productName = "", formulaScope = "unknown",
  productEvidence: targetEvidence = {}, sourceProduct = {}, products, limit = 5 }) {
  const sourceFormula = formulaSufficiency(sourceProduct, formulaScope);
  const target = analyzeComposition({ text, profile, productName, formulaScope, productEvidence: targetEvidence });
  if (target.productSafety?.shouldScoreAsCosmetic === false) return statusResult("withheld", "source_not_cosmetic");
  if (sourceFormula.status !== "sufficient") return statusResult("withheld", "source_formula_incomplete", { sourceFormula });
  if (target.productSafety?.type === "unknown_cosmetic") return statusResult("withheld", "source_purpose_unknown", { sourceFormula });
  if (target.personalization?.restrictions?.length) return statusResult("withheld", "source_personal_restriction", { sourceFormula });

  const targetIngredients = setOf((target.found || []).filter((item) => !item.excludedFromScoring).map((item) => item.name));
  if (targetIngredients.size < 2) return statusResult("withheld", "source_formula_incomplete", { sourceFormula });
  const targetActives = activeSet(target);
  const targetSupport = supportSet(target);
  const excludedName = normalize(productName);
  const rejected = {};
  const reject = (reason) => { rejected[reason] = (rejected[reason] || 0) + 1; };
  const eligible = [];

  for (const product of products || uniqueProducts()) {
    if (!product?.composition || isDemo(product)) { reject(isDemo(product) ? "demo_product" : "missing_composition"); continue; }
    const identity = normalize(`${product.brand || ""} ${product.name || ""}`);
    if (excludedName && (identity.includes(excludedName) || excludedName.includes(identity))) { reject("same_product"); continue; }
    const sufficiency = formulaSufficiency(product);
    if (!["sufficient", "reported_full"].includes(sufficiency.status)) { reject("candidate_formula_incomplete"); continue; }
    const candidate = analyzeComposition({ text: product.composition, profile, productName: `${product.brand || ""} ${product.name || ""}`.trim(),
      formulaScope: "full", productEvidence: catalogEvidence(product) });
    const compatibility = purposeCompatibility(target, candidate);
    if (!compatibility.ok) { reject(compatibility.reason); continue; }
    const personal = personalCompatibility(candidate);
    if (!personal.ok) { reject(personal.reason); continue; }
    eligible.push({ product, candidate, sufficiency });
  }

  const ranked = eligible.map(({ product, candidate, sufficiency }) => {
    const candidateIngredients = setOf((candidate.found || []).filter((item) => !item.excludedFromScoring).map((item) => item.name));
    const similarity = Math.max(0, Math.min(100, Math.round(jaccard(targetIngredients, candidateIngredients) * 55
      + jaccard(targetActives, activeSet(candidate)) * 20 + jaccard(targetSupport, supportSet(candidate)) * 15
      + scoreDistance(target, candidate) * 10)));
    return { product, candidate, sufficiency, similarity, common: intersection(targetIngredients, candidateIngredients),
      missing: difference(targetIngredients, candidateIngredients), added: difference(candidateIngredients, targetIngredients) };
  }).filter((item) => item.similarity >= 20).sort((a, b) => b.similarity - a.similarity).slice(0, limit);

  if (!ranked.length) return statusResult("empty", "no_compatible_products", { sourceFormula, rejected });
  return { status: "ready", reason: null,
    message: "Найдены продукты того же назначения. Это сравнение составов, а не подтверждение полной взаимозаменяемости.",
    sourceFormula, rejected,
    alternatives: ranked.map((item) => {
      const availability = availabilityEvidence(item.product);
      const priceComparison = comparePrices(sourceProduct, item.product);
      return { id: item.product.id, name: item.product.name || "Без названия", brand: item.product.brand || "Бренд не указан",
        category: item.product.category || "", source: item.product.source || "Локальная база", sourceType: item.product.sourceType || "local",
        sourceUrl: item.product.sourceUrl || null, imageUrl: item.product.imageUrl, similarity: item.similarity,
        similarityLabel: "Сходство состава", replacementStatus: "candidate_not_equivalent", formulaSufficiency: item.sufficiency,
        formulaType: item.candidate.formulaType, score: item.candidate.score, hydration_score: item.candidate.hydration_score,
        barrier_score: item.candidate.barrier_score, active_score: item.candidate.active_score, irritation_risk: item.candidate.irritation_risk,
        ruAvailability: availability.label, availabilityEvidence: availability, price: priceComparison.candidate.label, priceComparison,
        why: [`Совпадают компоненты: ${item.common.length ? item.common.slice(0, 10).join(", ") : "нет подтверждённых совпадений"}.`,
          `Нет в кандидате: ${item.missing.length ? item.missing.slice(0, 8).join(", ") : "существенных различий по распознанной части нет"}.`,
          `Дополнительно у кандидата: ${item.added.length ? item.added.slice(0, 8).join(", ") : "нет"}.`],
        matchedIngredients: item.common.slice(0, 10),
        differences: { missingFromCandidate: item.missing.slice(0, 12), addedByCandidate: item.added.slice(0, 12) },
        note: "Кандидат того же назначения, но не идентичная и не подтверждённо взаимозаменяемая формула. Сверьте актуальный INCI и инструкцию." };
    }) };
}

export function findFormulaAlternatives(options) {
  return findFormulaAlternativesDetailed(options).alternatives;
}
