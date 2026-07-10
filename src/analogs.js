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
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueProducts() {
  const byId = new Map();
  [
    ...readJson(productsPath, []),
    ...readJson(productIndexPath, []),
    ...readJson(productDetailsCachePath, [])
  ].forEach((product) => {
    if (!product?.id || !product?.composition) return;
    byId.set(product.id, { ...byId.get(product.id), ...product });
  });
  return Array.from(byId.values());
}

function setOf(items) {
  return new Set(items.filter(Boolean).map((item) => normalize(item)));
}

function intersectionSize(a, b) {
  let count = 0;
  a.forEach((item) => {
    if (b.has(item)) count += 1;
  });
  return count;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  const intersection = intersectionSize(a, b);
  return intersection / (a.size + b.size - intersection);
}

function activeSet(analysis) {
  return setOf(
    (analysis.found || [])
      .filter((item) => /актив|кислота|ретиноид|spf|uv|пептид|антиоксидант|aha|bha|pha/i.test(`${item.category} ${(item.roles || []).join(" ")}`))
      .map((item) => item.name)
  );
}

function supportSet(analysis) {
  return setOf(
    (analysis.found || [])
      .filter((item) => /увлажн|humectant|барьер|эмолент|окклюзив|керамид|липид|силикон|масло/i.test(`${item.category} ${(item.roles || []).join(" ")}`))
      .map((item) => item.name)
  );
}

function profileText(profile = {}) {
  return normalize(`${profile.skinType || ""} ${profile.context || ""} ${profile.concerns || ""}`);
}

function profileFit(candidateAnalysis, profile = {}) {
  const text = profileText(profile);
  if (!text) return 0;

  const best = (candidateAnalysis.positives || []).map(normalize);
  const warnings = (candidateAnalysis.warnings || []).map(normalize);
  const tokens = text.split(" ").filter((token) => token.length > 3);

  const positiveHits = tokens.filter((token) => best.some((item) => item.includes(token) || token.includes(item))).length;
  const warningHits = tokens.filter((token) => warnings.some((item) => item.includes(token))).length;

  return Math.max(-18, Math.min(18, positiveHits * 5 - warningHits * 6));
}

function scoreDistance(target, candidate) {
  const fields = ["hydration_score", "barrier_score", "active_score", "irritation_risk"];
  const distance = fields.reduce((sum, field) => sum + Math.abs((target[field] || 0) - (candidate[field] || 0)), 0);
  return Math.max(0, 1 - distance / 400);
}

function ruAvailability(product) {
  const text = normalize(`${product.market || ""} ${product.source || ""} ${product.sourceType || ""} ${product.sourceUrl || ""} ${product.brand || ""}`);
  if (/gigi|ru|russia|rf|рос|упаков|label photo|official brand page/.test(text)) {
    return "вероятно доступно или проверяемо в РФ";
  }
  if (product.sourceType === "open_beauty_facts") {
    return "доступность в РФ не подтверждена";
  }
  if (/demo/.test(text)) {
    return "демо-запись, не товар для покупки";
  }
  return "нужно проверить наличие в РФ";
}

function priceLabel(product) {
  return product.priceTier || product.priceRange || product.price || "цена пока не подключена";
}

function sourceAdjustment(product) {
  let adjustment = 0;
  const text = normalize(`${product.market || ""} ${product.compositionScope || ""} ${product.sourceType || ""}`);
  if (/demo/.test(text)) adjustment -= 12;
  if (/active ingredients only/.test(text)) adjustment -= 18;
  if (/label photo|official brand page/.test(text)) adjustment += 4;
  if (/open beauty facts/.test(text)) adjustment -= 3;
  return adjustment;
}

function explanation(target, candidate, ingredientOverlap, activeOverlap, supportOverlap) {
  const points = [];
  if (activeOverlap > 0) points.push("совпадают ключевые активы");
  if (supportOverlap > 0.25) points.push("похожий увлажняюще-барьерный блок");
  if (ingredientOverlap > 0.35) points.push("есть заметное пересечение INCI");
  if ((candidate.irritation_risk || 0) < (target.irritation_risk || 0)) points.push("потенциально мягче по риску раздражения");
  if (!points.length) points.push("похожесть частичная, нужна ручная проверка");
  return points;
}

export function findFormulaAlternatives({ text, profile = {}, productName = "", limit = 5 }) {
  const target = analyzeComposition({ text, profile });
  const targetIngredients = setOf((target.found || []).map((item) => item.name));
  const targetActives = activeSet(target);
  const targetSupport = supportSet(target);
  const excludedName = normalize(productName);

  if (targetIngredients.size < 2) return [];

  return uniqueProducts()
    .filter((product) => {
      if (!product.composition) return false;
      const identity = normalize(`${product.brand || ""} ${product.name || ""}`);
      return !excludedName || (!identity.includes(excludedName) && !excludedName.includes(identity));
    })
    .map((product) => {
      const candidate = analyzeComposition({ text: product.composition, profile });
      const candidateIngredients = setOf((candidate.found || []).map((item) => item.name));
      const candidateActives = activeSet(candidate);
      const candidateSupport = supportSet(candidate);

      const ingredientOverlap = jaccard(targetIngredients, candidateIngredients);
      const activeOverlap = jaccard(targetActives, candidateActives);
      const supportOverlap = jaccard(targetSupport, candidateSupport);
      const scoreSimilarity = scoreDistance(target, candidate);
      const fit = profileFit(candidate, profile);
      const irritationBonus = Math.max(-8, Math.min(10, ((target.irritation_risk || 0) - (candidate.irritation_risk || 0)) / 6));

      const score = Math.round(
        ingredientOverlap * 38 +
        activeOverlap * 26 +
        supportOverlap * 18 +
        scoreSimilarity * 14 +
        fit +
        irritationBonus +
        sourceAdjustment(product)
      );

      return {
        product,
        candidate,
        score: Math.max(0, Math.min(100, score)),
        ingredientOverlap,
        activeOverlap,
        supportOverlap
      };
    })
    .filter((item) => item.score >= 28)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({
      id: item.product.id,
      name: item.product.name || "Без названия",
      brand: item.product.brand || "Бренд не указан",
      category: item.product.category || "",
      source: item.product.source || "Локальная база",
      sourceType: item.product.sourceType || "local",
      imageUrl: item.product.imageUrl,
      similarity: item.score,
      formulaType: item.candidate.formulaType,
      score: item.candidate.score,
      hydration_score: item.candidate.hydration_score,
      barrier_score: item.candidate.barrier_score,
      active_score: item.candidate.active_score,
      irritation_risk: item.candidate.irritation_risk,
      ruAvailability: ruAvailability(item.product),
      price: priceLabel(item.product),
      why: explanation(target, item.candidate, item.ingredientOverlap, item.activeOverlap, item.supportOverlap),
      matchedIngredients: (item.candidate.found || [])
        .map((ingredient) => ingredient.name)
        .filter((name) => targetIngredients.has(normalize(name)))
        .slice(0, 10),
      note: "MVP-подбор по локальной базе: проверяйте полный INCI, цену и наличие перед покупкой."
    }));
}
