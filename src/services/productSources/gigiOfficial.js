import { fetchText, sourceProduct } from "./utils.js";

const BASE_URL = "https://www.gigi.ru";
const GIGI_LINE_HINTS = new Set([
  "acnon",
  "bioplasma",
  "city nap",
  "citynap",
  "ester c",
  "nutripeptide",
  "oxygeneo",
  "retinol forte",
  "solar energy",
  "sun care",
  "lipacid",
  "new age",
  "vitamin e"
]);

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  return [value, ...flattenJsonLd(value["@graph"] || [])];
}

function productJsonLd(html) {
  const blocks = String(html).match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const json = block
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();
    try {
      const candidate = flattenJsonLd(JSON.parse(json)).find((item) => {
        const type = Array.isArray(item?.["@type"]) ? item["@type"].join(" ") : item?.["@type"];
        return /product/i.test(String(type || ""));
      });
      if (candidate) return candidate;
    } catch {
      // Ignore malformed structured-data blocks and continue with the next one.
    }
  }
  return null;
}

function productSlugFromUrl(url = "") {
  try {
    return new URL(url, BASE_URL).pathname
      .replace(/^\/product\//i, "")
      .replace(/^\/+|\/+$/g, "");
  } catch {
    return "";
  }
}

function absoluteProductUrl(url = "") {
  const slug = productSlugFromUrl(url);
  return slug ? `${BASE_URL}/product/${slug}/` : "";
}

function activeIngredientsFromHtml(html) {
  const match = String(html).match(/Активные\s+ингредиенты\s*:<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
  return match ? stripTags(match[1]) : "";
}

function useInstructionsFromHtml(html) {
  const match = String(html).match(/Способ\s+применения\s*:<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
  return match ? stripTags(match[1]) : "";
}

export function extractGigiProductUrls(html, limit = 5) {
  const urls = new Set();
  const matches = String(html).matchAll(/href=["']([^"'#?]*\/product\/[^"'#?]+)[^"']*["']/gi);
  for (const match of matches) {
    const url = absoluteProductUrl(match[1]);
    if (url) urls.add(url);
    if (urls.size >= limit) break;
  }
  return Array.from(urls);
}

export function parseGigiProductPage(html, url) {
  const structured = productJsonLd(html);
  const sourceUrl = absoluteProductUrl(url);
  const slug = productSlugFromUrl(sourceUrl);
  const name = decodeHtml(structured?.name || "");
  const brand = decodeHtml(structured?.brand?.name || "GIGI") || "GIGI";
  const code = String(structured?.sku || "").trim();
  const activeIngredients = activeIngredientsFromHtml(html);
  const description = decodeHtml(structured?.description || "");
  const useInstructions = useInstructionsFromHtml(html);

  if (!name || !slug) return null;

  return {
    ...sourceProduct({
      id: `gigi-official-${slug}`,
      code,
      name,
      brand,
      category: "Профессиональная косметология GIGI",
      imageUrl: String(structured?.image || "").trim(),
      source: "Официальный каталог GIGI",
      sourceType: "gigi_official",
      sourceUrl
    }),
    description,
    activeIngredients,
    useInstructions,
    compositionScope: activeIngredients ? "active_ingredients_only" : "not_published",
    compositionAvailabilityNote: activeIngredients
      ? "Официальная карточка GIGI содержит назначение и заявленные активные ингредиенты, но не публикует полный INCI. Для разбора формулы нужен состав с упаковки."
      : "Официальная карточка GIGI не публикует полный INCI. Для разбора формулы нужен состав с упаковки.",
    trustLevel: "C",
    trustLabel: "Официальная карточка GIGI",
    trustNote: "Название, фото, описание и назначение получены из официального каталога GIGI. Полный INCI не подставляется без публикации производителем.",
    hasComposition: false
  };
}

function shouldSearchGigi(query = "") {
  const normalized = String(query).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (/\bgigi\b|джиджи/.test(normalized)) return true;
  return Array.from(GIGI_LINE_HINTS).some((hint) => normalized.includes(hint));
}

export const gigiOfficialSource = {
  id: "gigi_official",
  label: "Официальный каталог GIGI",
  requiresApiKey: false,

  async searchByBarcode() {
    // The public GIGI catalogue exposes internal SKUs, not a barcode lookup API.
    return [];
  },

  async searchByName(query, { limit = 5 } = {}) {
    if (!shouldSearchGigi(query)) return [];

    const searchUrl = `${BASE_URL}/search/?${new URLSearchParams({ q: String(query).trim() })}`;
    const searchHtml = await fetchText(searchUrl);
    const urls = extractGigiProductUrls(searchHtml, Math.min(Math.max(limit, 1), 8));
    const products = await Promise.all(urls.map(async (url) => parseGigiProductPage(await fetchText(url), url)));
    return products.filter(Boolean);
  },

  async getProduct(idOrUrl) {
    const raw = String(idOrUrl || "").trim();
    const slug = raw.replace(/^gigi-official-/, "");
    const url = absoluteProductUrl(slug);
    if (!url) return null;
    return parseGigiProductPage(await fetchText(url), url);
  }
};
