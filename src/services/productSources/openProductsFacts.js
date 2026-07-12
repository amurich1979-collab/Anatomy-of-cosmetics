import { fetchJson, pickImage, pickIngredients, sourceProduct } from "./utils.js";

const BASE_URL = "https://world.openproductsfacts.org";
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
  "url",
  "image_url",
  "image_front_url",
  "selected_images"
].join(",");

function toProduct(product = {}) {
  const code = product.code || "";
  const composition = pickIngredients(product);
  return sourceProduct({
    id: code ? `opf-${code}` : "",
    code,
    name: product.product_name,
    brand: product.brands,
    category: product.categories || "Товар из общего открытого каталога",
    imageUrl: pickImage(product),
    composition,
    source: "Open Products Facts",
    sourceType: "open_products_facts",
    sourceUrl: product.url || (code ? `${BASE_URL}/product/${code}` : ""),
    raw: product
  });
}

export const openProductsFactsSource = {
  id: "open_products_facts",
  label: "Open Products Facts",
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
    const code = String(idOrBarcode || "").replace(/^opf-/, "").trim();
    if (!code) return null;

    const params = new URLSearchParams({ fields: FIELDS });
    const data = await fetchJson(`${BASE_URL}/api/v2/product/${encodeURIComponent(code)}.json?${params}`);
    if (!data?.product) return null;
    return toProduct(data.product);
  }
};
