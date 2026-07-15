import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { getExternalProduct, searchExternalProducts } from "./services/productSources/index.js";

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

function makeExternalId(url) {
  return `web-${crypto.createHash("sha1").update(String(url)).digest("hex").slice(0, 14)}`;
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
    imageUrl: trusted.imageUrl,
    trustLevel: trusted.trustLevel || "E",
    trustLabel: trusted.trustLabel,
    trustNote: trusted.trustNote,
    verified: trusted.verified,
    verifiedAt: trusted.verifiedAt,
    importedAt: trusted.importedAt,
    compositionScope: trusted.compositionScope,
    compositionAvailabilityNote: trusted.compositionAvailabilityNote,
    activeIngredients: trusted.activeIngredients,
    description: trusted.description,
    useInstructions: trusted.useInstructions,
    composition: trusted.composition,
    formulaVariants: trusted.formulaVariants || [],
    hasFormulaConflict: Boolean(trusted.hasFormulaConflict),
    formulaConflictNote: trusted.formulaConflictNote,
    hasComposition: Boolean(trusted.hasComposition ?? trusted.composition),
    detailMode: trusted.detailMode || (trusted.sourceType === "open_beauty_facts" ? "open_beauty_facts" : "local")
  };
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCompositionFromText(text) {
  const clean = stripTags(text);
  const match = clean.match(/(?:состав|inci|ingredients)\s*[:.]\s*([^<>]{30,900})/i);
  if (!match) return "";

  return match[1]
    .replace(/\s+(?:описание|способ применения|характеристики|отзывы|купить|цена)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIndexRecord(product) {
  const summary = toSummary(product);
  return {
    ...summary,
    hasComposition: Boolean(product.composition || product.hasComposition),
    searchText: normalize(`${summary.brand} ${summary.name} ${summary.category} ${(product.searchAliases || []).join(" ")}`)
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

export function buildProductIndex(products = loadProducts(), { persist = true, includeExisting = true } = {}) {
  const unique = new Map();
  const sourceProducts = includeExisting ? [...readJson(productIndexPath, []), ...products] : products;

  sourceProducts.forEach((product) => {
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
  const haystack = product.searchText || normalize(`${product.brand} ${product.name} ${product.category} ${(product.searchAliases || []).join(" ")}`);
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

  if (score <= 0) return 0;

  if (product.verified) score += 12;
  if (product.hasComposition) score += 8;
  if (product.sourceType === "official_brand_page") score += 260;
  if (product.sourceType === "open_beauty_facts") score -= 30;

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
    imageUrl: product.image_url || product.image_front_url || product.selected_images?.front?.display?.ru || product.selected_images?.front?.display?.en,
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

async function fetchOpenBeautyFactsImage(query) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "6",
    fields: "code,product_name,brands,categories,url,image_url,image_front_url,selected_images"
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(`https://world.openbeautyfacts.org/cgi/search.pl?${params}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AnatomyCosmetologyMVP/0.1 (product image lookup)"
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const queryTokens = tokens(query).filter((token) => token.length > 2);
    const candidates = (data.products || [])
      .map(toOpenBeautyFactsSummary)
      .filter((product) => product?.imageUrl)
      .map((product) => {
        const text = normalize(`${product.brand} ${product.name}`);
        const score = queryTokens.filter((token) => text.includes(token)).length;
        return { product, score };
      })
      .filter((item) => item.score >= Math.min(2, queryTokens.length))
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.product || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichProductImage(product, cache = loadDetailsCache()) {
  if (!product || product.imageUrl || product.sourceType === "open_beauty_facts") return product;

  const query = `${product.brand || ""} ${product.name || ""}`.trim();
  if (query.length < 4) return product;

  const imageSource = await fetchOpenBeautyFactsImage(query);
  if (!imageSource?.imageUrl) return product;

  const enriched = {
    ...product,
    imageUrl: imageSource.imageUrl,
    imageSource: "Open Beauty Facts",
    imageSourceUrl: imageSource.sourceUrl
  };
  const enrichedId = enriched.id || enriched.code;
  const nextCache = [
    enriched,
    ...cache.filter((item) => item.id !== enrichedId && item.code !== enriched.code)
  ];
  saveDetailsCache(nextCache);
  buildProductIndex([enriched], { persist: true, includeExisting: true });
  return enriched;
}

async function fetchOpenBeautyFactsSearch(query, limit = 5) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(limit),
    fields: "code,product_name,brands,categories,ingredients_text,ingredients_text_en,ingredients_text_fr,ingredients_text_ru,ingredients_text_with_allergens,url,image_url,image_front_url,selected_images"
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
    fields: "code,product_name,brands,categories,ingredients_text,ingredients_text_en,ingredients_text_fr,ingredients_text_ru,ingredients_text_with_allergens,url,image_url,image_front_url,selected_images"
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

function parseDuckDuckGoResults(html, limit = 4) {
  const results = [];
  const blocks = String(html).split(/<div class="result\b/i).slice(1);

  for (const block of blocks) {
    const titleMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    const title = stripTags(titleMatch[2])
      .replace(/\s*[-|–]\s*(Ozon|Wildberries|Яндекс Маркет|Yandex Market|Маркет|Market).*$/i, "")
      .trim();
    const sourceUrl = decodeURIComponent(titleMatch[1].replace(/^.*uddg=/, "").replace(/&rut=.*$/, ""));
    const snippet = stripTags(snippetMatch?.[1] || "");
    const composition = extractCompositionFromText(`${title}. ${snippet}`);

    if (!title || !sourceUrl || results.some((item) => item.sourceUrl === sourceUrl)) continue;

    results.push(withTrust({
      id: makeExternalId(sourceUrl),
      name: title.slice(0, 160),
      brand: title.split(/\s+/)[0] || "Источник из интернета",
      category: "Найдено во внешнем поиске",
      composition,
      source: "Внешний поиск",
      sourceUrl,
      sourceType: "web_search",
      detailMode: "web_search",
      trustLevel: "E",
      trustLabel: composition ? "Черновик из интернета" : "Найдено в интернете",
      trustNote: "Карточка найдена внешним поиском. Состав нужно сверить по упаковке или официальной карточке.",
      verified: false,
      hasComposition: Boolean(composition),
      importedAt: new Date().toISOString().slice(0, 10)
    }));

    if (results.length >= limit) break;
  }

  return results.map(toSummary);
}

async function fetchWebSearchProducts(query, limit = 4) {
  if (process.env.WEB_SEARCH_FALLBACK === "false") return [];

  const params = new URLSearchParams({
    q: `${query} состав INCI косметология OR косметика`,
    kl: "ru-ru"
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);

  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AnatomyCosmetologyMVP/0.1 (external product lookup)"
      }
    });

    if (!response.ok) return [];

    const html = await response.text();
    const products = parseDuckDuckGoResults(html, limit);
    const cache = loadDetailsCache();
    const details = products
      .filter((product) => product.hasComposition)
      .map((product) => ({
        ...product,
        composition: extractCompositionFromText(`${product.name}. ${product.trustNote || ""}`) || product.composition
      }));

    if (details.length) {
      const detailIds = new Set(details.map((product) => product.id));
      saveDetailsCache([...details, ...cache.filter((product) => !detailIds.has(product.id))]);
    }

    return products;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchProducts(query, limit = 8) {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 1) return [];

  const local = searchLocalProducts(query, limit);
  if (normalizedQuery.length < 3) return local.slice(0, limit);

  const external = await searchExternalProducts(query, { limit });
  const seen = new Set();
  const freshExternal = external.filter((product) => {
    const identity = normalize(`${product.brand} ${product.name}`);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).map(toSummary);

  const cacheable = external.filter((product) => product.composition || product.imageUrl);
  if (cacheable.length) {
    const cache = loadDetailsCache();
    const cacheKeys = new Set(cacheable.map((product) => product.id || product.code));
    saveDetailsCache([...cacheable, ...cache.filter((product) => !cacheKeys.has(product.id || product.code))]);
  }

  const merged = [...local, ...freshExternal].filter((product, index, list) => {
    const identity = normalize(`${product.brand} ${product.name}`);
    return list.findIndex((candidate) => normalize(`${candidate.brand} ${candidate.name}`) === identity) === index;
  });
  if (merged.length >= limit) return merged.slice(0, limit);

  const webExternal = await fetchWebSearchProducts(query, Math.max(0, limit - merged.length));
  const freshWebExternal = webExternal.filter((product) => {
    const identity = normalize(`${product.brand} ${product.name}`);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  return [...merged, ...freshWebExternal].slice(0, limit);
}

export function listCatalogProducts() {
  const cacheById = new Map(loadDetailsCache().map((product) => [product.id || product.code, product]));
  return loadProductIndex()
    .map((product) => {
      const cached = cacheById.get(product.id || product.code);
      return toSummary(cached?.imageUrl ? { ...product, imageUrl: cached.imageUrl } : product);
    })
    .sort((a, b) => {
      return (
        a.brand.localeCompare(b.brand) ||
        a.name.localeCompare(b.name)
      );
    });
}

export async function getProductDetails(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;

  const local = loadProducts().find((product) => product.id === cleanId || product.code === cleanId);
  if (local) return withTrust(await enrichProductImage(local));

  const cache = loadDetailsCache();
  const cached = cache.find((product) => product.id === cleanId || product.code === cleanId);
  if (cached) return withTrust(await enrichProductImage(cached, cache));

  if (/^(obf|opf|upcitemdb|gigi-official|external-catalog|incidecoder)-/.test(cleanId) || /^\d{6,}$/.test(cleanId)) {
    const detail = await getExternalProduct(cleanId);
    if (detail) {
      const nextCache = [detail, ...cache.filter((product) => product.id !== detail.id && product.code !== detail.code)];
      saveDetailsCache(nextCache);
      return withTrust(detail);
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
