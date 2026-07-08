import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const productsPath = path.join(dataDir, "products.json");
const productIndexPath = path.join(dataDir, "product-index.json");
const productDetailsCachePath = path.join(dataDir, "product-details-cache.json");
const reviewQueuePath = path.join(dataDir, "review-queue.json");

const TRUST = {
  A: {
    label: "Проверено",
    note: "Состав подтвержден внутренней проверенной базой или официальным источником.",
    verified: true
  },
  B: {
    label: "По этикетке",
    note: "Состав подтвержден фото упаковки или этикетки.",
    verified: true
  },
  C: {
    label: "Совпало в источниках",
    note: "Состав совпадает в нескольких внешних источниках, но еще не прошел ручную проверку.",
    verified: false
  },
  D: {
    label: "Open Beauty Facts",
    note: "Данные найдены в Open Beauty Facts. Перед рекомендациями лучше сверить состав по упаковке.",
    verified: false
  },
  E: {
    label: "Черновик",
    note: "Данные требуют проверки и не должны считаться подтвержденными.",
    verified: false
  }
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return normalize(value).split(" ").filter(Boolean);
}

function trustMeta(product) {
  const trust = TRUST[product.trustLevel] || TRUST.E;
  return {
    trustLabel: product.trustLabel || trust.label,
    trustNote: product.trustNote || trust.note,
    verified: Boolean(product.verified ?? trust.verified)
  };
}

function withTrust(product) {
  return {
    ...product,
    ...trustMeta(product)
  };
}

function toSummary(product) {
  const trusted = withTrust(product);
  return {
    id: trusted.id,
    code: trusted.code,
    name: trusted.name || "Без названия",
    brand: trusted.brand || "Бренд не указан",
    category: trusted.category || "Категория не указана",
    source: trusted.source || "Локальная база",
    sourceUrl: trusted.sourceUrl,
    sourceType: trusted.sourceType || "local",
    trustLevel: trusted.trustLevel || "E",
    trustLabel: trusted.trustLabel,
    trustNote: trusted.trustNote,
    verified: trusted.verified,
    verifiedAt: trusted.verifiedAt,
    importedAt: trusted.importedAt,
    hasComposition: Boolean(trusted.hasComposition ?? trusted.composition),
    detailMode: trusted.detailMode || (trusted.sourceType === "open_beauty_facts" ? "open_beauty_facts" : "local")
  };
}

function toIndexRecord(product) {
  const summary = toSummary(product);
  return {
    ...summary,
    hasComposition: Boolean(product.composition || product.hasComposition),
    searchText: normalize(`${summary.brand} ${summary.name} ${summary.category}`)
  };
}

function loadProducts() {
  return readJson(productsPath, []);
}

function loadProductIndex() {
  const index = readJson(productIndexPath, null);
  if (Array.isArray(index) && index.length) return index;
  return buildProductIndex(loadProducts(), { persist: false });
}

function loadDetailsCache() {
  return readJson(productDetailsCachePath, []);
}

function saveDetailsCache(cache) {
  writeJson(productDetailsCachePath, cache.slice(0, 5000));
}

export function buildProductIndex(products = loadProducts(), { persist = true } = {}) {
  const unique = new Map();

  products.forEach((product) => {
    if (!product?.id || !product?.name) return;
    unique.set(product.id, toIndexRecord(product));
  });

  const index = Array.from(unique.values()).sort((a, b) => {
    const verifiedDelta = Number(b.verified) - Number(a.verified);
    return verifiedDelta || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
  });

  if (persist) writeJson(productIndexPath, index);
  return index;
}

function localScore(product, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;

  const brand = normalize(product.brand);
  const name = normalize(product.name);
  const category = normalize(product.category);
  const full = normalize(`${product.brand} ${product.name}`);
  const haystack = product.searchText || normalize(`${product.brand} ${product.name} ${product.category}`);
  const queryTokens = tokens(normalizedQuery);
  const productTokens = tokens(`${product.brand} ${product.name}`);

  let score = 0;

  if (full === normalizedQuery || name === normalizedQuery) score += 500;
  if (name.startsWith(normalizedQuery)) score += 220;
  if (full.startsWith(normalizedQuery)) score += 200;
  if (brand.startsWith(normalizedQuery)) score += 160;
  if (haystack.includes(normalizedQuery)) score += 80;
  if (category.includes(normalizedQuery)) score += 20;

  queryTokens.forEach((queryToken) => {
    const tokenHit = productTokens.some((productToken) => productToken.startsWith(queryToken));
    const tokenInside = productTokens.some((productToken) => productToken.includes(queryToken));
    if (tokenHit) score += 70;
    else if (tokenInside && queryToken.length > 1) score += 25;
  });

  if (product.verified) score += 12;
  if (product.hasComposition) score += 8;
  if (product.sourceType === "open_beauty_facts") score -= 4;

  return score;
}

export function searchLocalProducts(query, limit = 8) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  return loadProductIndex()
    .map((product) => ({ product: toSummary(product), score: localScore(product, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      return (
        b.score - a.score ||
        Number(b.product.verified) - Number(a.product.verified) ||
        a.product.brand.localeCompare(b.product.brand) ||
        a.product.name.localeCompare(b.product.name)
      );
    })
    .slice(0, limit)
    .map(({ product }) => ({
      ...product,
      sourceType: product.sourceType || "local"
    }));
}

export function identifyLocalProductFromText(text) {
  const normalizedText = normalize(text);
  if (normalizedText.length < 8) return null;

  const ranked = loadProductIndex()
    .map((product) => {
      const fullName = normalize(`${product.brand} ${product.name}`);
      const name = normalize(product.name);
      const productTokens = tokens(`${product.brand} ${product.name}`).filter((token) => token.length > 2);
      const tokenHits = productTokens.filter((token) => normalizedText.includes(token)).length;
      const exactBoost = normalizedText.includes(fullName) || normalizedText.includes(name) ? 12 : 0;
      return { product: toSummary(product), score: tokenHits + exactBoost };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;

  return {
    ...ranked[0].product,
    sourceType: ranked[0].product.sourceType || "local",
    confidence: Math.min(0.98, 0.45 + ranked[0].score * 0.08)
  };
}

function pickIngredients(product) {
  return (
    product.ingredients_text ||
    product.ingredients_text_en ||
    product.ingredients_text_fr ||
    product.ingredients_text_ru ||
    product.ingredients_text_with_allergens ||
    ""
  ).trim();
}

function openBeautyFactsCode(idOrCode = "") {
  return String(idOrCode).replace(/^obf-/, "").trim();
}

function toOpenBeautyFactsSummary(product) {
  const code = product.code || "";
  const name = product.product_name?.trim();
  if (!code || !name) return null;

  return toSummary({
    id: `obf-${code}`,
    code,
    name,
    brand: product.brands?.trim() || "Бренд не указан",
    category: product.categories?.trim() || "Косметологическое средство",
    source: "Open Beauty Facts",
    sourceUrl: product.url || `https://world.openbeautyfacts.org/product/${code}`,
    sourceType: "open_beauty_facts",
    detailMode: "open_beauty_facts",
    trustLevel: "D",
    verified: false,
    hasComposition: Boolean(pickIngredients(product))
  });
}

function toOpenBeautyFactsDetail(product) {
  const summary = toOpenBeautyFactsSummary(product);
  const composition = pickIngredients(product);
  if (!summary || !composition) return null;

  return withTrust({
    ...summary,
    composition,
    importedAt: new Date().toISOString().slice(0, 10),
    formulaVersion: "external-open-beauty-facts",
    market: "external"
  });
}

async function fetchOpenBeautyFactsSearch(query, limit = 5) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(limit),
    fields: "code,product_name,brands,categories,ingredients_text,ingredients_text_en,ingredients_text_fr,ingredients_text_ru,ingredients_text_with_allergens,url"
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(`https://world.openbeautyfacts.org/cgi/search.pl?${params}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AnatomyCosmetologyMVP/0.1 (product search)"
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (data.products || [])
      .map(toOpenBeautyFactsSummary)
      .filter(Boolean)
      .filter((product) => product.hasComposition)
      .slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenBeautyFactsDetail(code) {
  const cleanCode = openBeautyFactsCode(code);
  if (!cleanCode) return null;

  const params = new URLSearchParams({
    fields: "code,product_name,brands,categories,ingredients_text,ingredients_text_en,ingredients_text_fr,ingredients_text_ru,ingredients_text_with_allergens,url"
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(cleanCode)}.json?${params}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AnatomyCosmetologyMVP/0.1 (product detail)"
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    return toOpenBeautyFactsDetail(data.product || {});
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchOpenBeautyFacts(query, limit = 5) {
  return fetchOpenBeautyFactsSearch(query, limit);
}

export async function searchProducts(query, limit = 8) {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 1) return [];

  const local = searchLocalProducts(query, limit);
  if (normalizedQuery.length < 3 || local.length >= limit) return local.slice(0, limit);

  const external = await searchOpenBeautyFacts(query, Math.max(0, limit - local.length));
  const seen = new Set(local.map((product) => normalize(`${product.brand} ${product.name}`)));
  const freshExternal = external.filter((product) => {
    const identity = normalize(`${product.brand} ${product.name}`);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  return [...local, ...freshExternal].slice(0, limit);
}

export async function getProductDetails(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;

  const local = loadProducts().find((product) => product.id === cleanId || product.code === cleanId);
  if (local?.composition) return withTrust(local);

  const cache = loadDetailsCache();
  const cached = cache.find((product) => product.id === cleanId || product.code === cleanId);
  if (cached?.composition) return withTrust(cached);

  if (cleanId.startsWith("obf-") || /^\d{6,}$/.test(cleanId)) {
    const detail = await fetchOpenBeautyFactsDetail(cleanId);
    if (detail?.composition) {
      const nextCache = [detail, ...cache.filter((product) => product.id !== detail.id && product.code !== detail.code)];
      saveDetailsCache(nextCache);
      return detail;
    }
  }

  return null;
}

export async function identifyProductFromText(text) {
  const local = identifyLocalProductFromText(text);
  if (local) return local;

  const normalizedText = normalize(text);
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && line.length <= 90)
    .filter((line) => !/ingredients|inci|состав|ингредиенты|directions|usage|warning|caution/i.test(line))
    .slice(0, 8);

  for (const line of lines) {
    const products = await searchProducts(line, 4);
    const exact = products.find((product) => {
      const name = normalize(product.name);
      const brandAndName = normalize(`${product.brand} ${product.name}`);
      const normalizedLine = normalize(line);
      return (
        normalizedText.includes(name) ||
        normalizedText.includes(brandAndName) ||
        name.includes(normalizedLine) ||
        brandAndName.includes(normalizedLine)
      );
    });

    if (exact) {
      const detail = await getProductDetails(exact.id);
      return {
        ...(detail || exact),
        confidence: exact.verified ? 0.9 : 0.68
      };
    }
  }

  return null;
}

export function createReviewRequest({ query, source = "web", notes = "" }) {
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 2) {
    return null;
  }

  const queue = readJson(reviewQueuePath, []);
  const normalizedQuery = normalize(cleanQuery);
  const existing = queue.find((item) => normalize(item.query) === normalizedQuery);

  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.lastRequestedAt = new Date().toISOString();
    writeJson(reviewQueuePath, queue);
    return existing;
  }

  const request = {
    id: `review-${Date.now()}`,
    query: cleanQuery,
    status: "needs_review",
    source,
    notes,
    count: 1,
    createdAt: new Date().toISOString(),
    lastRequestedAt: new Date().toISOString()
  };

  queue.unshift(request);
  writeJson(reviewQueuePath, queue.slice(0, 500));
  return request;
}

export function listReviewRequests() {
  return readJson(reviewQueuePath, []);
}
