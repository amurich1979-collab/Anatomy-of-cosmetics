import { openBeautyFactsSource } from "./openBeautyFacts.js";
import { openProductsFactsSource } from "./openProductsFacts.js";
import { upcItemDbSource } from "./upcItemDb.js";
import { isBarcode, normalizeProductText } from "./utils.js";

export const productSources = [
  openBeautyFactsSource,
  upcItemDbSource,
  openProductsFactsSource
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

async function runSources(method, value, options = {}) {
  const settled = await Promise.allSettled(
    productSources.map(async (source) => {
      const results = await source[method](value, options);
      return (Array.isArray(results) ? results : [results]).filter(Boolean);
    })
  );

  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

export async function searchExternalProducts(query, { limit = 8 } = {}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];

  const products = isBarcode(cleanQuery)
    ? await runSources("searchByBarcode", cleanQuery, { limit })
    : await runSources("searchByName", cleanQuery, { limit });

  return mergeSourceProducts(products).slice(0, limit);
}

export async function searchExternalProductByBarcode(barcode, { limit = 8 } = {}) {
  const cleanBarcode = String(barcode || "").trim();
  if (!isBarcode(cleanBarcode)) return [];

  return mergeSourceProducts(await runSources("searchByBarcode", cleanBarcode, { limit })).slice(0, limit);
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
