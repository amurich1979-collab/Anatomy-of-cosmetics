import { fetchText, sourceProduct } from "./utils.js";

const SEARCH_URL = "https://html.duckduckgo.com/html/";
const BASE_URL = "https://incidecoder.com";

function decodeHtml(value = "") {
  return String(value)
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(String(value).replace(/<[^>]+>/g, " "));
}

function fullInci(value = "") {
  const clean = decodeHtml(value).trim();
  const parts = clean.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
  const latinCharacters = (clean.match(/[A-Za-z]/g) || []).length;
  return parts.length >= 3 && latinCharacters >= 12 ? clean.slice(0, 1800) : "";
}

function productUrl(raw = "") {
  const decoded = decodeHtml(raw);
  const encoded = decoded.match(/[?&]uddg=([^&]+)/i)?.[1];
  const target = encoded ? decodeURIComponent(encoded) : decoded;
  const url = target.startsWith("//") ? `https:${target}` : target;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "incidecoder.com" && /^\/products\//.test(parsed.pathname) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function externalId(url) {
  return `incidecoder-${Buffer.from(url).toString("base64url")}`;
}

function urlFromId(id = "") {
  const encoded = String(id).replace(/^incidecoder-/, "");
  if (!encoded || encoded === id) return "";
  try {
    const url = Buffer.from(encoded, "base64url").toString("utf8");
    return new URL(url).hostname === "incidecoder.com" ? url : "";
  } catch {
    return "";
  }
}

export function extractInciDecoderUrls(html, limit = 4) {
  const urls = new Set();
  const matches = String(html).matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)/gi);
  for (const match of matches) {
    const url = productUrl(match[1]);
    if (url) urls.add(url);
    if (urls.size >= limit) break;
  }
  return Array.from(urls);
}

export function parseInciDecoderProductPage(html, url) {
  const title = String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const description = String(html).match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1];
  const name = stripTags(title || "");
  const descriptionText = decodeHtml(description || "");
  const ingredientText = descriptionText.match(/ingredients\s+explained\s*:\s*([\s\S]+)/i)?.[1] || "";
  const composition = fullInci(ingredientText);

  if (!name || !composition) return null;

  return {
    ...sourceProduct({
      id: externalId(url),
      name,
      brand: "Не указан",
      category: "Косметическое средство",
      composition,
      source: "INCI Decoder",
      sourceType: "inci_decoder",
      sourceUrl: url
    }),
    description: descriptionText,
    compositionScope: "unverified_external_inci",
    compositionAvailabilityNote: "Состав найден в INCI Decoder. Перед применением его нужно сверить с упаковкой: формулы могут различаться по рынку или дате выпуска.",
    trustLevel: "E",
    trustLabel: "INCI Decoder",
    trustNote: "Состав получен из внешней базы INCI Decoder и не считается подтверждённым без сверки с упаковкой или официальной карточкой.",
    hasComposition: true
  };
}

export const inciDecoderSource = {
  id: "inci_decoder",
  label: "INCI Decoder",
  requiresApiKey: false,
  isFallback: true,

  async searchByBarcode() {
    return [];
  },

  async searchByName(query, { limit = 4 } = {}) {
    const html = await fetchText(`${SEARCH_URL}?${new URLSearchParams({ q: `site:incidecoder.com/products ${query}` })}`, { timeoutMs: 5500 });
    const urls = extractInciDecoderUrls(html, Math.min(Math.max(limit, 1), 4));
    const products = await Promise.all(urls.map(async (url) => parseInciDecoderProductPage(await fetchText(url), url)));
    return products.filter(Boolean);
  },

  async getProduct(id) {
    const url = urlFromId(id);
    if (!url) return null;
    return parseInciDecoderProductPage(await fetchText(url), url);
  }
};
