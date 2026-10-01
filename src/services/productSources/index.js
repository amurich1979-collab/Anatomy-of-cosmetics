import { openBeautyFactsSource } from "./openBeautyFacts.js";
import { openProductsFactsSource } from "./openProductsFacts.js";
import { upcItemDbSource } from "./upcItemDb.js";
import { gigiOfficialSource } from "./gigiOfficial.js";
import { externalCatalogDiscoverySource } from "./externalCatalogDiscovery.js";
import { inciDecoderSource } from "./inciDecoder.js";
import { barcodesEquivalent, isBarcode, normalizeProductText } from "./utils.js";

export const productSources = [
  gigiOfficialSource,
  openBeautyFactsSource,
  upcItemDbSource,
  openProductsFactsSource,
  inciDecoderSource,
  externalCatalogDiscoverySource
];

export const PRODUCT_SOURCE_CACHE_TTL_MS = Object.freeze({
  found: 6 * 60 * 60 * 1000,
  no_inci: 6 * 60 * 60 * 1000,
  not_found: 5 * 60 * 1000,
  unavailable: 30 * 1000
});

const SOURCE_TIMEOUT_MS = 8_000;
const MAX_CACHE_ENTRIES = 500;
const sourceCache = new Map();
const GENERIC_IDENTITY_TOKENS = new Set([
  "and", "the", "for", "with", "cream", "serum", "gel", "lotion", "mask", "balm", "oil",
  "крем", "сыворотка", "гель", "лосьон", "маска", "бальзам", "масло", "для", "и", "с", "по",
  "ml", "мл"
]);
const UNKNOWN_BRANDS = new Set(["", "не указан", "бренд не указан", "unknown", "not specified"]);

function normalizeFormula(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N},;/+\-\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([,;/+-])\s*/g, "$1")
    .trim();
}

function identity(product) {
  if (product.code) {
    const code = String(product.code).trim();
    return `code:${code.length === 12 ? `0${code}` : code}`;
  }
  return normalizeProductText(`${product.brand} ${product.name}`);
}

function meaningfulTokens(value) {
  return normalizeProductText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !GENERIC_IDENTITY_TOKENS.has(token));
}

function normalizedBrand(value) {
  const brand = normalizeProductText(value);
  return UNKNOWN_BRANDS.has(brand) ? "" : brand;
}

function numericTokens(value) {
  return normalizeProductText(value).split(" ").filter((token) => /^\d+(?:\.\d+)?$/.test(token));
}

export function isCompatibleProductIdentity(identified, candidate) {
  if (!identified || !candidate) return false;
  if (identified.code && candidate.code) return barcodesEquivalent(identified.code, candidate.code);

  const identifiedBrand = normalizedBrand(identified.brand);
  const candidateBrand = normalizedBrand(candidate.brand);
  if (identifiedBrand && candidateBrand) {
    const brandCompatible = identifiedBrand === candidateBrand ||
      identifiedBrand.includes(candidateBrand) || candidateBrand.includes(identifiedBrand);
    if (!brandCompatible) return false;
  }

  const baseNumbers = numericTokens(identified.name);
  const candidateNumbers = numericTokens(candidate.name);
  if (baseNumbers.length || candidateNumbers.length) {
    if (baseNumbers.join("|") !== candidateNumbers.join("|")) return false;
  }

  const baseName = normalizeProductText(identified.name);
  const candidateName = normalizeProductText(candidate.name);
  if (!baseName || !candidateName) return false;
  if (baseName === candidateName) return true;
  if (baseName.length >= 6 && (baseName.includes(candidateName) || candidateName.includes(baseName))) return true;

  const baseTokens = meaningfulTokens(baseName);
  const candidateTokens = new Set(meaningfulTokens(candidateName));
  if (!baseTokens.length) return false;
  const hits = baseTokens.filter((token) => candidateTokens.has(token)).length;
  return hits >= 2 && hits / baseTokens.length >= 0.7;
}

export function rankSourceProducts(products, query) {
  const cleanQuery = String(query || "").trim();
  if (isBarcode(cleanQuery)) {
    return products.filter((product) => barcodesEquivalent(product.code, cleanQuery));
  }

  const ignoredTokens = new Set(["and", "the", "for", "with", "и", "для", "с", "по"]);
  const queryTokens = normalizeProductText(cleanQuery)
    .split(" ")
    .filter((token) => token.length > 1 && !ignoredTokens.has(token));
  if (!queryTokens.length) return products;

  return products
    .map((product) => {
      const searchable = normalizeProductText(`${product.brand} ${product.name} ${product.category}`);
      const matchedTokens = queryTokens.filter((token) => searchable.includes(token));
      if (!matchedTokens.length) return null;

      const tokenScore = matchedTokens.reduce((score, token) => {
        return score + (/^\d+(?:\.\d+)?$/.test(token) ? 10 : 5);
      }, 0);
      const exactName = searchable.includes(queryTokens.join(" ")) ? 4 : 0;
      const completeMatch = matchedTokens.length === queryTokens.length ? 3 : 0;
      const officialBoost = product.sourceType === "gigi_official" ? 1 : 0;
      const compositionBoost = product.composition ? 10 : 0;
      return { product, score: tokenScore + exactName + completeMatch + officialBoost + compositionBoost };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .map(({ product }) => product);
}

function formulaVariant(product) {
  if (!product.composition) return null;
  return {
    composition: product.composition,
    source: product.source,
    sourceType: product.sourceType,
    sourceUrl: product.sourceUrl,
    updatedAt: product.updatedAt,
    fetchedAt: product.importedAt,
    retrievedAt: product.importedAt,
    market: product.market,
    variant: product.variant,
    formulaVersion: product.formulaVersion,
    productName: product.name,
    brand: product.brand
  };
}

export function mergeSourceProducts(products) {
  const byIdentity = new Map();

  products.filter(Boolean).forEach((product) => {
    const key = identity(product);
    const existing = byIdentity.get(key);
    if (!existing) {
      const firstVariant = formulaVariant(product);
      byIdentity.set(key, {
        ...product,
        hasComposition: Boolean(product.composition),
        sourceResults: [product],
        formulaVariants: firstVariant ? [firstVariant] : [],
        hasFormulaConflict: false
      });
      return;
    }

    const nextSources = [...(existing.sourceResults || []), product];
    const nextVariants = [...(existing.formulaVariants || [])];
    const nextVariant = formulaVariant(product);
    if (nextVariant) {
      const normalizedComposition = normalizeFormula(nextVariant.composition);
      const duplicateFormula = nextVariants.some((variant) => normalizeFormula(variant.composition) === normalizedComposition);
      if (!duplicateFormula) nextVariants.push(nextVariant);
    }

    byIdentity.set(key, {
      ...existing,
      name: existing.name || product.name,
      brand: existing.brand || product.brand,
      category: existing.category || product.category,
      imageUrl: existing.imageUrl || product.imageUrl,
      composition: existing.composition || product.composition,
      hasComposition: Boolean(existing.composition || product.composition),
      sourceResults: nextSources,
      formulaVariants: nextVariants,
      hasFormulaConflict: nextVariants.length > 1,
      formulaConflictNote: nextVariants.length > 1
        ? "Найдены разные версии состава в разных источниках. Формулы могут отличаться по рынку, партии или году выпуска; они не смешаны автоматически."
        : undefined
    });
  });

  return Array.from(byIdentity.values());
}

function sourceStatus(source, method, products, error) {
  if (error) {
    return {
      sourceId: source.id,
      source: source.label,
      method,
      status: "unavailable",
      reason: error.code || (error.name === "SourceTimeoutError" ? "timeout" : "source_error")
    };
  }
  if (!products.length) {
    return { sourceId: source.id, source: source.label, method, status: "not_found" };
  }
  return {
    sourceId: source.id,
    source: source.label,
    method,
    status: products.some((product) => product.composition) ? "found" : "no_inci",
    products: products.length
  };
}

async function callWithTimeout(task, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error("Product source timed out");
          error.name = "SourceTimeoutError";
          error.code = "timeout";
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function runSourcesDetailed(sources, method, value, options = {}) {
  const attempts = await Promise.all(sources.map(async (source) => {
    try {
      const response = await callWithTimeout(
        () => source[method](value, options),
        options.timeoutMs || SOURCE_TIMEOUT_MS
      );
      const products = (Array.isArray(response) ? response : [response]).filter(Boolean);
      return { products, status: sourceStatus(source, method, products) };
    } catch (error) {
      return { products: [], status: sourceStatus(source, method, [], error) };
    }
  }));

  return {
    products: attempts.flatMap((attempt) => attempt.products),
    statuses: attempts.map((attempt) => attempt.status),
    attempts
  };
}

function resultStatus(products, sourceStatuses) {
  if (products.some((product) => product.composition || product.hasComposition)) return "found";
  if (products.length) return "no_inci";
  if (sourceStatuses.some((source) => source.status === "unavailable")) return "unavailable";
  return "not_found";
}

function cacheKey(query, limit, sources) {
  return `${isBarcode(query) ? "barcode" : "name"}:${normalizeProductText(query)}:${limit}:${sources.map((source) => source.id).join(",")}`;
}

function readCache(key, now) {
  const cached = sourceCache.get(key);
  if (!cached || cached.expiresAt <= now) {
    if (cached) sourceCache.delete(key);
    return null;
  }
  return {
    ...cached.value,
    cache: { hit: true, expiresAt: new Date(cached.expiresAt).toISOString() }
  };
}

function writeCache(key, value, now) {
  const ttl = PRODUCT_SOURCE_CACHE_TTL_MS[value.status] || PRODUCT_SOURCE_CACHE_TTL_MS.unavailable;
  if (sourceCache.size >= MAX_CACHE_ENTRIES) sourceCache.delete(sourceCache.keys().next().value);
  sourceCache.set(key, { value, expiresAt: now + ttl });
  return { ...value, cache: { hit: false, expiresAt: new Date(now + ttl).toISOString() } };
}

export function clearProductSourceCache() {
  sourceCache.clear();
}

function identitySearchQuery(product) {
  return `${normalizedBrand(product.brand)} ${product.name || ""}`.replace(/\s+/g, " ").trim();
}

async function searchByBarcodeDetailed(barcode, { limit, sources, timeoutMs }) {
  const barcodeSources = sources.filter((source) => !source.isFallback);
  const barcodeAttempts = await runSourcesDetailed(barcodeSources, "searchByBarcode", barcode, { limit, timeoutMs });
  const exactProducts = barcodeAttempts.products.filter((product) => barcodesEquivalent(product.code, barcode));
  const identified = mergeSourceProducts(exactProducts);
  const enrichmentStatuses = [];
  const enrichedProducts = [];

  for (const product of identified) {
    const query = identitySearchQuery(product);
    if (!query) continue;

    const enrichment = await runSourcesDetailed(sources, "searchByName", query, {
      limit: Math.min(limit, 4),
      timeoutMs
    });
    enrichment.attempts.forEach((attempt) => {
      const accepted = attempt.products.filter((candidate) => isCompatibleProductIdentity(product, candidate));
      const status = attempt.status.status === "unavailable"
        ? attempt.status
        : sourceStatus(
            { id: attempt.status.sourceId, label: attempt.status.source },
            attempt.status.method,
            accepted
          );
      enrichmentStatuses.push({
        ...status,
        phase: "inci_enrichment",
        reason: accepted.length ? status.reason : attempt.products.length ? "identity_mismatch" : status.reason
      });
      accepted.forEach((candidate) => {
        enrichedProducts.push({
          ...candidate,
          reportedCode: candidate.code || undefined,
          code: product.code,
          matchedProductId: product.id,
          identityMatch: "brand_model"
        });
      });
    });
  }

  const products = mergeSourceProducts([...exactProducts, ...enrichedProducts]).slice(0, limit);
  const sourceStatuses = [
    ...barcodeAttempts.statuses.map((status) => ({ ...status, phase: "barcode_identity" })),
    ...enrichmentStatuses
  ];
  return { products, sourceStatuses, status: resultStatus(products, sourceStatuses) };
}

async function searchByNameDetailed(query, { limit, sources, timeoutMs }) {
  const primarySources = sources.filter((source) => !source.isFallback);
  const primary = await runSourcesDetailed(primarySources, "searchByName", query, { limit, timeoutMs });
  let allProducts = [...primary.products];
  let sourceStatuses = primary.statuses.map((status) => ({ ...status, phase: "primary_name" }));
  let products = rankSourceProducts(mergeSourceProducts(allProducts), query);

  const needsDiscovery = products.length < Math.min(limit, 3) ||
    !products.some((product) => product.hasComposition || product.composition);
  const fallbackSources = sources.filter((source) => source.isFallback);
  if (needsDiscovery && fallbackSources.length) {
    const fallback = await runSourcesDetailed(fallbackSources, "searchByName", query, {
      limit: Math.min(limit, 4),
      timeoutMs
    });
    allProducts = [...allProducts, ...fallback.products];
    sourceStatuses = [
      ...sourceStatuses,
      ...fallback.statuses.map((status) => ({ ...status, phase: "fallback_name" }))
    ];
    products = rankSourceProducts(mergeSourceProducts(allProducts), query);
  }

  products = products.slice(0, limit);
  return { products, sourceStatuses, status: resultStatus(products, sourceStatuses) };
}

export async function searchExternalProductsDetailed(query, {
  limit = 8,
  sources = productSources,
  timeoutMs = SOURCE_TIMEOUT_MS,
  useCache = true,
  now = Date.now()
} = {}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) {
    return { products: [], sourceStatuses: [], status: "not_found", cache: { hit: false } };
  }

  const key = cacheKey(cleanQuery, limit, sources);
  if (useCache) {
    const cached = readCache(key, now);
    if (cached) return cached;
  }

  const result = isBarcode(cleanQuery)
    ? await searchByBarcodeDetailed(cleanQuery, { limit, sources, timeoutMs })
    : await searchByNameDetailed(cleanQuery, { limit, sources, timeoutMs });
  const value = { ...result, query: cleanQuery };
  return useCache ? writeCache(key, value, now) : { ...value, cache: { hit: false } };
}

export async function searchExternalProducts(query, options = {}) {
  return (await searchExternalProductsDetailed(query, options)).products;
}

export async function searchExternalProductByBarcode(barcode, options = {}) {
  const cleanBarcode = String(barcode || "").trim();
  if (!isBarcode(cleanBarcode)) return [];
  return (await searchExternalProductsDetailed(cleanBarcode, options)).products;
}

export async function getExternalProduct(idOrBarcode) {
  const cleanId = String(idOrBarcode || "").trim();
  if (!cleanId) return null;
  if (isBarcode(cleanId)) {
    return (await searchExternalProductsDetailed(cleanId, { limit: 8 })).products[0] || null;
  }

  const settled = await Promise.allSettled(productSources.map((source) => (
    callWithTimeout(() => source.getProduct(cleanId), SOURCE_TIMEOUT_MS)
  )));
  const products = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter(Boolean);
  return mergeSourceProducts(products)[0] || null;
}

export function getProductSourceInfo() {
  return productSources.map((source) => ({
    id: source.id,
    label: source.label,
    requiresApiKey: source.requiresApiKey
  }));
}
