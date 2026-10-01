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

export function barcodesEquivalent(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  if (!a || !b || !/^\d+$/.test(a) || !/^\d+$/.test(b)) return false;
  if (a === b) return true;
  return (a.length === 13 && a.startsWith("0") && a.slice(1) === b) ||
    (b.length === 13 && b.startsWith("0") && b.slice(1) === a);
}

export class ProductSourceUnavailableError extends Error {
  constructor(message, { code = "source_error", status } = {}) {
    super(message);
    this.name = "ProductSourceUnavailableError";
    this.code = code;
    this.status = status;
  }
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

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new ProductSourceUnavailableError(`Product source returned HTTP ${response.status}`, {
        code: response.status === 429 ? "rate_limited" : "http_error",
        status: response.status
      });
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ProductSourceUnavailableError) throw error;
    throw new ProductSourceUnavailableError("Product source request failed", {
      code: error?.name === "AbortError" ? "timeout" : "network_error"
    });
  } finally {
    timeout.clear();
  }
}

export async function fetchText(url, { timeoutMs = 6500, headers = {} } = {}) {
  const timeout = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: {
        "User-Agent": PRODUCT_SOURCE_USER_AGENT,
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
        ...headers
      }
    });

    if (response.status === 404) return "";
    if (!response.ok) {
      throw new ProductSourceUnavailableError(`Product source returned HTTP ${response.status}`, {
        code: response.status === 429 ? "rate_limited" : "http_error",
        status: response.status
      });
    }
    return await response.text();
  } catch (error) {
    if (error instanceof ProductSourceUnavailableError) throw error;
    throw new ProductSourceUnavailableError("Product source request failed", {
      code: error?.name === "AbortError" ? "timeout" : "network_error"
    });
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
  sourceUrl = "",
  updatedAt,
  market,
  variant,
  formulaVersion
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
    updatedAt,
    market,
    variant,
    formulaVersion,
    trustLevel: sourceType === "open_beauty_facts" ? "D" : "E",
    verified: false,
    hasComposition: Boolean(composition),
    detailMode: sourceType,
    importedAt: new Date().toISOString()
  };
}
