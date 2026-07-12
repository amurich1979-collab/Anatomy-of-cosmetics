import { fetchJson, sourceProduct } from "./utils.js";

const BASE_URL = "https://api.upcitemdb.com/prod/trial";

function toProduct(item = {}) {
  const code = item.ean || item.upc || "";
  const imageUrl = Array.isArray(item.images) ? item.images[0] : "";
  return sourceProduct({
    id: code ? `upcitemdb-${code}` : "",
    code,
    name: item.title,
    brand: item.brand,
    category: item.category || item.description || "Товар по штрихкоду",
    imageUrl,
    composition: "",
    source: "UPCitemdb",
    sourceType: "upcitemdb",
    sourceUrl: item.offers?.[0]?.link || (code ? `https://www.upcitemdb.com/upc/${code}` : ""),
    raw: item
  });
}

export const upcItemDbSource = {
  id: "upcitemdb",
  label: "UPCitemdb",
  requiresApiKey: false,

  async searchByBarcode(barcode) {
    const product = await this.getProduct(barcode);
    return product ? [product] : [];
  },

  async searchByName(query, { limit = 5 } = {}) {
    const params = new URLSearchParams({ s: query, match_mode: "0" });
    const data = await fetchJson(`${BASE_URL}/search?${params}`);
    return (data?.items || []).map(toProduct).filter(Boolean).slice(0, limit);
  },

  async getProduct(idOrBarcode) {
    const code = String(idOrBarcode || "").replace(/^upcitemdb-/, "").trim();
    if (!code) return null;

    const data = await fetchJson(`${BASE_URL}/lookup?upc=${encodeURIComponent(code)}`);
    return toProduct((data?.items || [])[0] || {});
  }
};
