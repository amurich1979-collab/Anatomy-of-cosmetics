const SIMPLE_FORMATS = new Set(["ean_8", "ean_13", "upc_a", "upc_e"]);

function formatName(value = "") {
  return String(value).trim().toLowerCase().replace(/-/g, "_");
}

function digitsOnly(value) {
  const text = String(value ?? "").trim();
  if (!text || !/^[\d\s-]+$/.test(text)) return "";
  return text.replace(/[\s-]+/g, "");
}

export function hasValidGtinCheckDigit(value) {
  const digits = String(value || "");
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let index = body.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += Number(body[index]) * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

export function upcaToEan13(upc) {
  return /^\d{12}$/.test(String(upc || "")) ? `0${upc}` : "";
}

export function expandUpce(upce) {
  const value = String(upce || "");
  if (!/^[01]\d{7}$/.test(value)) return "";
  const [numberSystem, x1, x2, x3, x4, x5, x6, check] = value;
  let body;
  if (/[012]/.test(x6)) body = `${numberSystem}${x1}${x2}${x6}0000${x3}${x4}${x5}`;
  else if (x6 === "3") body = `${numberSystem}${x1}${x2}${x3}00000${x4}${x5}`;
  else if (x6 === "4") body = `${numberSystem}${x1}${x2}${x3}${x4}00000${x5}`;
  else body = `${numberSystem}${x1}${x2}${x3}${x4}${x5}0000${x6}`;
  return `${body}${check}`;
}

function invalid(reason = "Код должен быть EAN-8, UPC-A или EAN-13 с корректной контрольной цифрой.") {
  return { valid: false, reason, lookupCode: "", equivalents: [], type: "unknown" };
}

export function normalizeProductIdentifier(value, format = "") {
  const detectedFormat = formatName(format);
  if (detectedFormat === "qr_code" || detectedFormat === "qr") {
    return parseSupportedQr(value) || invalid("QR не содержит поддерживаемый идентификатор товара GS1/EAN/UPC.");
  }
  if (detectedFormat && !SIMPLE_FORMATS.has(detectedFormat)) {
    return invalid("Этот формат кода не используется для поиска товара.");
  }

  const digits = digitsOnly(value);
  if (!digits) return invalid();

  if (detectedFormat === "upc_e") {
    const upca = expandUpce(digits);
    if (!upca || !hasValidGtinCheckDigit(upca)) return invalid("Некорректная контрольная цифра UPC-E.");
    return {
      valid: true,
      raw: digits,
      lookupCode: upcaToEan13(upca),
      equivalents: [digits, upca, upcaToEan13(upca)],
      type: "UPC-E"
    };
  }

  if (digits.length === 8 && (!detectedFormat || detectedFormat === "ean_8")) {
    if (hasValidGtinCheckDigit(digits)) {
      return { valid: true, raw: digits, lookupCode: digits, equivalents: [digits], type: "EAN-8" };
    }
    if (!detectedFormat) {
      const upca = expandUpce(digits);
      if (upca && hasValidGtinCheckDigit(upca)) {
        return {
          valid: true,
          raw: digits,
          lookupCode: upcaToEan13(upca),
          equivalents: [digits, upca, upcaToEan13(upca)],
          type: "UPC-E"
        };
      }
    }
    return invalid("Некорректная контрольная цифра EAN-8/UPC-E.");
  }
  if (digits.length === 12 && (!detectedFormat || detectedFormat === "upc_a")) {
    if (!hasValidGtinCheckDigit(digits)) return invalid("Некорректная контрольная цифра UPC-A.");
    return {
      valid: true,
      raw: digits,
      lookupCode: upcaToEan13(digits),
      equivalents: [digits, upcaToEan13(digits)],
      type: "UPC-A"
    };
  }
  if (digits.length === 13 && (!detectedFormat || detectedFormat === "ean_13")) {
    if (!hasValidGtinCheckDigit(digits)) return invalid("Некорректная контрольная цифра EAN-13.");
    const upca = digits.startsWith("0") ? digits.slice(1) : "";
    return {
      valid: true,
      raw: digits,
      lookupCode: digits,
      equivalents: upca ? [upca, digits] : [digits],
      type: "EAN-13"
    };
  }
  return invalid();
}

export function parseSupportedQr(value) {
  const raw = String(value ?? "").trim();
  if (/^\d{8}$|^\d{12}$|^\d{13}$/.test(raw)) {
    const normalized = normalizeProductIdentifier(raw);
    return normalized.valid ? { ...normalized, sourceFormat: "QR" } : null;
  }

  let gtin14 = "";
  if (/^01\d{14}$/.test(raw)) gtin14 = raw.slice(2);
  else {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "id.gs1.org") return null;
      const match = url.pathname.match(/(?:^|\/)01\/(\d{14})(?:\/|$)/);
      gtin14 = match?.[1] || "";
    } catch {
      return null;
    }
  }
  if (!gtin14 || !hasValidGtinCheckDigit(gtin14)) return null;
  return {
    valid: true,
    raw,
    lookupCode: gtin14,
    equivalents: [gtin14],
    type: "GTIN-14",
    sourceFormat: "GS1 QR"
  };
}
