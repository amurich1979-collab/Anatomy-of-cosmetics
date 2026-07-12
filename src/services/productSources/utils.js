export const PRODUCT_SOURCE_USER_AGENT = "AnatomyCosmetologyMVP/0.1 (product source integration)";

export function normalizeProductText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBarcode(value) {
  return /^\d{6,14}$/.test(String(value || "").trim());
}

export function pickIngredients(product = {}) {
  return (
    product.ingredients_text ||
    product.ingredients_text_en ||
    product.ingredients_text_fr ||
    product.ingredients_text_es ||
    product.ingredients_text_de ||
    product.ingredients_text_it ||
    product.ingredients_text_pt ||
    product.ingredients_text_ru ||
    product.ingredients_text_with_allergens ||
    ""
  ).trim();
}

export function pickImage(product = {}) {
  return (
    product.image_url ||
    product.image_front_url ||
    product.selected_images?.front?.display?.ru ||
    product.selected_images?.front?.display?.en ||
    product.images?.[0] ||
    ""
  );
}

export function timeoutSignal(ms = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

export async function fetchJson(url, { timeoutMs = 4500, headers = {} } = {}) {
  const timeout = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: {
        "User-Agent": PRODUCT_SOURCE_USER_AGENT,
        ...headers
      }
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    timeout.clear();
  }
}

export function sourceProduct({
  id,
  code = "",
  name = "",
  brand = "",
  category = "",
  imageUrl = "",
  composition = "",
  source,
  sourceType,
  sourceUrl = ""
}) {
  const cleanName = String(name || "").trim();
  const cleanCode = String(code || "").trim();
  if (!cleanName && !cleanCode) return null;

  return {
    id: id || `${sourceType}-${cleanCode || normalizeProductText(cleanName).replace(/\s+/g, "-").slice(0, 80)}`,
    code: cleanCode,
    name: cleanName || cleanCode,
    brand: String(brand || "").trim() || "Бренд не указан",
    category: String(category || "").trim() || "Категория не указана",
    imageUrl: String(imageUrl || "").trim(),
    composition: String(composition || "").trim(),
    ingredients_text: String(composition || "").trim(),
    source,
    sourceType,
    sourceUrl,
    trustLevel: sourceType === "open_beauty_facts" ? "D" : "E",
    verified: false,
    hasComposition: Boolean(composition),
    detailMode: sourceType,
    importedAt: new Date().toISOString()
  };
}
