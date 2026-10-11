const INCI_MARKER = /\b(?:ingredients?|ingre[dl]ients?|ngredients?|credients?|inci)\b|состав\s*(?:\([^)]*\))?/i;
const FRONT_HINT = /\b(?:cream|serum|lotion|cleanser|shampoo|mask|balm|spf|moisturi[sz]ing)\b|крем|сыворот|лосьон|шампун|маска|бальзам|увлаж/i;
const BARCODE_HINT = /\b(?:ean|upc|barcode|штрихкод)\b/i;

function barcodeFromText(text) {
  const candidates = String(text || "").match(/\b\d{8,14}\b/g) || [];
  return candidates.find((value) => [8, 12, 13, 14].includes(value.length)) || null;
}

export function classifyPhotoText({ text = "", cleaned = {}, product = null } = {}) {
  const raw = String(text || "");
  const ingredients = Array.isArray(cleaned.ingredients) ? cleaned.ingredients : [];
  const entries = Array.isArray(cleaned.entries) ? cleaned.entries : [];
  const preservedUnknowns = entries
    .filter((entry) => entry.status !== "confirmed")
    .map((entry) => entry.ingredient || entry.raw)
    .filter(Boolean);
  const hasInciMarker = INCI_MARKER.test(raw);
  const barcode = barcodeFromText(raw);
  const hasBarcodeLabel = BARCODE_HINT.test(raw);
  const hasFrontHint = FRONT_HINT.test(raw);

  let kind = "unknown";
  if ((hasInciMarker && ingredients.length >= 1) || ingredients.length >= 3) kind = "inci";
  else if (hasInciMarker && product) kind = "mixed";
  else if (product && (barcode || hasFrontHint || raw.trim().length >= 3)) kind = "front";
  else if (barcode && (hasBarcodeLabel || raw.replace(/\d/g, "").trim().length < 24)) kind = "barcode";

  return {
    kind,
    barcode,
    preservedUnknowns,
    signals: {
      inciMarker: hasInciMarker,
      ingredientCount: ingredients.length,
      productCandidate: Boolean(product),
      barcodeCandidate: Boolean(barcode),
      frontHint: hasFrontHint
    }
  };
}
