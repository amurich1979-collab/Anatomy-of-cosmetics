import { fetchText, sourceProduct } from "./utils.js";

const SEARCH_URL = "https://html.duckduckgo.com/html/";
const BLOCKED_HOSTS = /(?:duckduckgo\.com|google\.com|bing\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com)/i;

function decodeHtml(value = "") {
  return String(value)
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
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

function findProductJsonLd(html) {
  const blocks = String(html).match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const json = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const product = flattenJsonLd(JSON.parse(json)).find((item) => {
        const type = Array.isArray(item?.["@type"]) ? item["@type"].join(" ") : item?.["@type"];
        return /product/i.test(String(type || ""));
      });
      if (product) return product;
    } catch {
      // Continue with the next structured-data block.
    }
  }
  return null;
}

function fullInci(value = "") {
  const clean = decodeHtml(Array.isArray(value) ? value.join(", ") : value)
    .replace(/\s+(?:directions|how to use|warning|caution|manufacturer|способ применения|меры предосторожности|производитель)\b[\s\S]*$/i, "")
    .trim();
  const parts = clean.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
  const latinCharacters = (clean.match(/[A-Za-z]/g) || []).length;

  if (parts.length < 3 || latinCharacters < 12 || latinCharacters / Math.max(clean.length, 1) < 0.35) return "";
  return clean.slice(0, 1800);
}

function extractVisibleInci(html) {
  const text = stripTags(html);
  const match = text.match(/(?:\bINCI\b|\bINGREDIENTS\b|СОСТАВ)\s*[:\-]\s*([\s\S]{25,1800})/i);
  return fullInci(match?.[1] || "");
}

function externalId(url) {
  return `external-catalog-${Buffer.from(url).toString("base64url")}`;
}

function urlFromExternalId(id = "") {
  const encoded = String(id).replace(/^external-catalog-/, "");
  if (!encoded || encoded === id) return "";
  try {
    const url = Buffer.from(encoded, "base64url").toString("utf8");
    return /^https?:\/\//i.test(url) ? url : "";
  } catch {
    return "";
  }
}

function imageUrl(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.url || value.contentUrl || "").trim();
  return String(value || "").trim();
}

function resultUrl(raw = "") {
  const decoded = decodeHtml(raw);
  const redirect = decoded.match(/[?&]uddg=([^&]+)/i)?.[1];
  const candidate = redirect ? decodeURIComponent(redirect) : decoded;
  const normalized = candidate.startsWith("//") ? `https:${candidate}` : candidate;
  try {
    const url = new URL(normalized);
    return BLOCKED_HOSTS.test(url.hostname) ? "" : url.toString();
  } catch {
    return "";
  }
}

export function extractExternalSearchUrls(html, limit = 4) {
  const urls = new Set();
  const blocks = String(html).split(/<div class=["']result\b/i).slice(1);
  for (const block of blocks) {
    const match = block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)/i);
    const url = resultUrl(match?.[1]);
    if (url) urls.add(url);
    if (urls.size >= limit) break;
  }
  return Array.from(urls);
}

export function parseExternalProductPage(html, url) {
  const structured = findProductJsonLd(html);
  if (!structured?.name) return null;

  const parsedUrl = new URL(url);
  const composition = fullInci(structured.ingredients) || extractVisibleInci(html);
  const brand = decodeHtml(structured.brand?.name || structured.brand || "") || "Бренд не указан";
  const sku = String(structured.sku || structured.gtin13 || structured.gtin || "").trim();

  return {
    ...sourceProduct({
      id: externalId(url),
      code: sku,
      name: decodeHtml(structured.name),
      brand,
      category: "Карточка продукта из внешнего источника",
      imageUrl: imageUrl(structured.image),
      composition,
      source: `Внешняя карточка продукта: ${parsedUrl.hostname}`,
      sourceType: "external_catalog",
      sourceUrl: url
    }),
    description: decodeHtml(structured.description || ""),
    compositionScope: composition ? "unverified_external_inci" : "not_published",
    compositionAvailabilityNote: composition
      ? "Состав найден на внешней карточке товара. Перед применением его нужно сверить с упаковкой."
      : "Карточка товара найдена, но полный INCI на ней не опубликован. Для разбора формулы нужен состав с упаковки.",
    trustLevel: "E",
    trustLabel: "Внешняя карточка товара",
    trustNote: `Карточка найдена на ${parsedUrl.hostname}. Данные не считаются подтверждёнными без сверки с упаковкой или официальным источником.`,
    hasComposition: Boolean(composition)
  };
}

export const externalCatalogDiscoverySource = {
  id: "external_catalog_discovery",
  label: "Поиск внешних карточек товаров",
  requiresApiKey: false,
  isFallback: true,

  async searchByBarcode() {
    return [];
  },

  async searchByName(query, { limit = 4 } = {}) {
    const searchHtml = await fetchText(`${SEARCH_URL}?${new URLSearchParams({ q: `${query} косметика состав INCI` })}`, { timeoutMs: 5500 });
    const urls = extractExternalSearchUrls(searchHtml, Math.min(Math.max(limit, 1), 4));
    const products = await Promise.all(urls.map(async (url) => parseExternalProductPage(await fetchText(url), url)));
    return products.filter(Boolean);
  },

  async getProduct(id) {
    const url = urlFromExternalId(id);
    if (!url) return null;
    return parseExternalProductPage(await fetchText(url), url);
  }
};
