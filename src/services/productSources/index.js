import { openBeautyFactsSource } from "./openBeautyFacts.js";
import { openProductsFactsSource } from "./openProductsFacts.js";
import { upcItemDbSource } from "./upcItemDb.js";
import { gigiOfficialSource } from "./gigiOfficial.js";
import { externalCatalogDiscoverySource } from "./externalCatalogDiscovery.js";
import { inciDecoderSource } from "./inciDecoder.js";
import { isBarcode, normalizeProductText } from "./utils.js";

export const productSources = [
  gigiOfficialSource,
  openBeautyFactsSource,
  upcItemDbSource,
  openProductsFactsSource,
  inciDecoderSource,
  externalCatalogDiscoverySource
];

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
  if (product.code) return `code:${product.code}`;
  return normalizeProductText(`${product.brand} ${product.name}`);
}

export function rankSourceProducts(products, query) {
  const ignoredTokens = new Set(["and", "the", "for", "with", "и", "для", "с", "по"]);
  const queryTokens = normalizeProductText(query)
    .split(" ")
    .filter((token) => token.length > 1 && !ignoredTokens.has(token));
  if (!queryTokens.length) return products;

  return products
    .map((product) => {
      const searchable = normalizeProductText(`${product.brand} ${product.name} ${product.category}`);
      const tokenScore = queryTokens.reduce((score, token) => {
        if (!searchable.includes(token)) return score;
        return score + (/^\d+(?:\.\d+)?$/.test(token) ? 10 : 5);
      }, 0);
      const hits = queryTokens.filter((token) => searchable.includes(token)).length;
      const exactName = searchable.includes(queryTokens.join(" ")) ? 4 : 0;
      const completeMatch = hits === queryTokens.length ? 3 : 0;
      const officialBoost = product.sourceType === "gigi_official" ? 1 : 0;
      const compositionBoost = product.composition ? 10 : 0;
      return { product, score: tokenScore + exactName + completeMatch + officialBoost + compositionBoost };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ product }) => product);
}

export function mergeSourceProducts(products) {
  const byIdentity = new Map();

  products.filter(Boolean).forEach((product) => {
    const key = identity(product);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, {
        ...product,
        sourceResults: [product],
        formulaVariants: product.composition
          ? [{
              composition: product.composition,
              source: product.source,
              sourceType: product.sourceType,
              sourceUrl: product.sourceUrl,
              fetchedAt: product.importedAt
            }]
          : []
      });
      return;
    }

    const nextSources = [...(existing.sourceResults || []), product];
    const nextVariants = [...(existing.formulaVariants || [])];
    if (product.composition) {
      const normalizedComposition = normalizeFormula(product.composition);
      const duplicateFormula = nextVariants.some((variant) => normalizeFormula(variant.composition) === normalizedComposition);
      if (!duplicateFormula) {
        nextVariants.push({
          composition: product.composition,
          source: product.source,
          sourceType: product.sourceType,
          sourceUrl: product.sourceUrl,
          fetchedAt: product.importedAt
        });
      }
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

async function runSources(sources, method, value, options = {}) {
  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const results = await source[method](value, options);
      return (Array.isArray(results) ? results : [results]).filter(Boolean);
    })
  );

  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

export async function searchExternalProducts(query, { limit = 8 } = {}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];

  const primarySources = productSources.filter((source) => !source.isFallback);
  const primaryProducts = isBarcode(cleanQuery)
    ? await runSources(primarySources, "searchByBarcode", cleanQuery, { limit })
    : await runSources(primarySources, "searchByName", cleanQuery, { limit });
  let merged = rankSourceProducts(mergeSourceProducts(primaryProducts), cleanQuery);

  const needsDiscovery = !isBarcode(cleanQuery) && (
    merged.length < Math.min(limit, 3) ||
    !merged.some((product) => product.hasComposition || product.composition)
  );
  if (needsDiscovery) {
    const fallbackProducts = await runSources(
      productSources.filter((source) => source.isFallback),
      "searchByName",
      cleanQuery,
      { limit: Math.min(limit, 4) }
    );
    merged = rankSourceProducts(mergeSourceProducts([...primaryProducts, ...fallbackProducts]), cleanQuery);
  }

  return merged.slice(0, limit);
}

export async function searchExternalProductByBarcode(barcode, { limit = 8 } = {}) {
  const cleanBarcode = String(barcode || "").trim();
  if (!isBarcode(cleanBarcode)) return [];

  return mergeSourceProducts(await runSources(productSources.filter((source) => !source.isFallback), "searchByBarcode", cleanBarcode, { limit })).slice(0, limit);
}

export async function getExternalProduct(idOrBarcode) {
  const cleanId = String(idOrBarcode || "").trim();
  if (!cleanId) return null;

  const settled = await Promise.allSettled(productSources.map((source) => source.getProduct(cleanId)));
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
