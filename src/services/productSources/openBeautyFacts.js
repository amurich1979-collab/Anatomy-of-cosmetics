import { fetchJson, pickImage, pickIngredients, sourceProduct } from "./utils.js";

const BASE_URL = "https://world.openbeautyfacts.org";
const FIELDS = [
  "code",
  "product_name",
  "brands",
  "categories",
  "ingredients_text",
  "ingredients_text_en",
  "ingredients_text_fr",
  "ingredients_text_es",
  "ingredients_text_de",
  "ingredients_text_it",
  "ingredients_text_pt",
  "ingredients_text_ru",
  "ingredients_text_with_allergens",
  "url",
  "image_url",
  "image_front_url",
  "selected_images"
].join(",");

function toProduct(product = {}) {
  const code = product.code || "";
  const composition = pickIngredients(product);
  return sourceProduct({
    id: code ? `obf-${code}` : "",
    code,
    name: product.product_name,
    brand: product.brands,
    category: product.categories || "Косметическое средство",
    imageUrl: pickImage(product),
    composition,
    source: "Open Beauty Facts",
    sourceType: "open_beauty_facts",
    sourceUrl: product.url || (code ? `${BASE_URL}/product/${code}` : ""),
    raw: product
  });
}

export const openBeautyFactsSource = {
  id: "open_beauty_facts",
  label: "Open Beauty Facts",
  requiresApiKey: false,

  async searchByBarcode(barcode) {
    const product = await this.getProduct(barcode);
    return product ? [product] : [];
  },

  async searchByName(query, { limit = 5 } = {}) {
    const params = new URLSearchParams({
      search_terms: query,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: String(limit),
      fields: FIELDS
    });
    const data = await fetchJson(`${BASE_URL}/cgi/search.pl?${params}`);
    return (data?.products || []).map(toProduct).filter(Boolean);
  },

  async getProduct(idOrBarcode) {
    const code = String(idOrBarcode || "").replace(/^obf-/, "").trim();
    if (!code) return null;

    const params = new URLSearchParams({ fields: FIELDS });
    const data = await fetchJson(`${BASE_URL}/api/v2/product/${encodeURIComponent(code)}.json?${params}`);
    if (!data?.product) return null;
    return toProduct(data.product);
  }
};
