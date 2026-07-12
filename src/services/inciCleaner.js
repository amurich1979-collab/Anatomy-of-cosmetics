import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findCosIngIngredient, normalizeInciKey } from "./ingredientSources/cosing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");
const expertPath = path.join(rootDir, "data", "ingredients-expert.json");
const translationsPath = path.join(rootDir, "data", "inci-translations.json");

const START_MARKER = /\b(?:ingredients?|ingre[dl]ients?|ngredients?|credients?|inci)\b\s*[:：-]?|состав\s*(?:\([^)]*\))?\s*[:：-]?/i;
const END_MARKER = /\b(?:directions?|how\s+to\s+use|warning|caution|storage|manufacturer|made\s+in|barcode|usage|use\s+by|best\s+before|expiry|eac|code|llc|inc\.?|ltd\.?|new\s+york|ny\s+\d{5}|ho\s+chi|minh|viet\s?nam|the\s+nexus|quan\s+\d+)\b|меры\s+предосторожности|способ\s+применения|применение|изготовитель|производитель|срок\s+годности|условия\s+хранения|дата\s+изготовления|номер\s+партии|партия|гост|еас/i;
const ADDRESS_OR_LABEL_NOISE = /\b(?:canh|bao|kha|tre|tuoi|sinh|tranh|children|external|avoid|contact|directly|manufacturer|distributor|importer|address|llc|inc\.?|ltd\.?|new\s+york|ny\s+\d{5}|ho\s+chi|minh|viet\s?nam|nexus|quan\s+\d+|tang\s+\d+|code|barcode|eac|ean)\b|предосторожности|производитель|изготовитель|адрес|импортер|штрихкод|срок|партия/i;

const OCR_REPLACEMENTS = [
  { pattern: /\bnacinamide\b/gi, replacement: "Niacinamide", confidence: 1 },
  { pattern: /\bphenoxyethanal\b/gi, replacement: "Phenoxyethanol", confidence: 1 },
  { pattern: /\bhydrogenated\s+castor\s+of\b/gi, replacement: "Hydrogenated Castor Oil", confidence: 1 },
  { pattern: /\bethyherlylglycerin\b/gi, replacement: "Ethylhexylglycerin", confidence: 1 },
  { pattern: /\bethyhexylglycerin\b/gi, replacement: "Ethylhexylglycerin", confidence: 0.98 },
  { pattern: /\bpeg\s*[-–—]?\s*40\b/gi, replacement: "PEG-40", confidence: 1 },
  { pattern: /\bcetylpalmitate\b/gi, replacement: "Cetyl Palmitate", confidence: 0.98 },
  { pattern: /\bsodium\s+laurqyl\s+lactylate\b/gi, replacement: "Sodium Lauroyl Lactylate", confidence: 0.98 },
  { pattern: /\bsodium\s+lauroyl\s+lactylate\b/gi, replacement: "Sodium Lauroyl Lactylate", confidence: 1 },
  { pattern: /\bedta\s+dipqtasronate\b/gi, replacement: "Dipotassium EDTA", confidence: 0.9 },
  { pattern: /\b(?:sodium\s+)?rimoniun\s+methosulfate\b/gi, replacement: "Behentrimonium Methosulfate", confidence: 0.85 },
  { pattern: /\bbehentrima\b/gi, replacement: "Behentrimonium Methosulfate", confidence: 0.85 },
  { pattern: /\bcopper\s+tripeptide\s+l\b/gi, replacement: "Copper Tripeptide-1", confidence: 0.98 }
];

const SUSPICIOUS_HINTS = [
  {
    pattern: /\bbotnoyl\b/i,
    suggested_match: "Botulinum/Botox-like peptide or proprietary component",
    confidence: 0.55,
    reason: "Похоже на OCR-ошибку или торговое название; автоматически не исправлено."
  }
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const EXPERT_INDEX = new Map();
readJson(expertPath, []).forEach((item) => {
  [item.name, ...(item.aliases || [])].forEach((name) => {
    const key = normalizeInciKey(name);
    if (key && !EXPERT_INDEX.has(key)) EXPERT_INDEX.set(key, item.name);
  });
});

const TRANSLATION_INDEX = new Map();
readJson(translationsPath, []).forEach((item) => {
  Object.entries(item.translations || {}).forEach(([language, names]) => {
    names.forEach((name) => {
      const key = normalizeInciKey(name);
      if (key && !TRANSLATION_INDEX.has(key)) {
        TRANSLATION_INDEX.set(key, {
          canonical: item.canonical,
          language
        });
      }
    });
  });
});

function normalizeRawText(value) {
  return String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[|]/g, "I")
    .replace(/[\\]/g, " ")
    .replace(/\b(?:CREDIENTS|NGREDIENTS|INGRELIENTS)\b/gi, "INGREDIENTS")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function joinBrokenIngredients(text) {
  return String(text || "")
    .replace(/([A-Za-z]+)-\s*\n\s*(\d+)/g, "$1-$2")
    .replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, "$1-$2")
    .replace(/\bPEG-\s+(\d+)/gi, "PEG-$1")
    .replace(/\bPPG-\s+(\d+)/gi, "PPG-$1")
    .replace(/\b([A-Za-z]+)\s+Tripeptide-\s+(\d+)\b/gi, "$1 Tripeptide-$2");
}

function stripNoiseLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/https?:\/\/|www\.|\.ru\b|\.com\b|@/.test(line))
    .filter((line) => !/(тел\.?|phone|fax|\+?\d[\d\s()\-]{7,})/i.test(line))
    .filter((line) => !/\b\d{8,14}\b/.test(line))
    .filter((line) => !/\b(?:ml|мл|g|гр|kg|кг)\b/i.test(line) || /,|acid|extract|oil|glycol|aqua|water/i.test(line))
    .filter((line) => !/^(?:eac|ean|barcode|batch|lot|серия|арт\.?|гост|ту)\b/i.test(line))
    .filter((line) => !ADDRESS_OR_LABEL_NOISE.test(line))
    .join("\n");
}

export function extractInciBlock(rawText) {
  const normalized = joinBrokenIngredients(normalizeRawText(rawText));
  const startMatch = normalized.match(START_MARKER);
  let block = startMatch
    ? normalized.slice((startMatch.index || 0) + startMatch[0].length)
    : normalized;

  const endMatch = block.match(END_MARKER);
  if (endMatch) block = block.slice(0, endMatch.index);

  return stripNoiseLines(block)
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function applyOcrDictionary(ingredient) {
  let value = ingredient;
  const corrections = [];

  OCR_REPLACEMENTS.forEach((rule) => {
    const before = value;
    value = value.replace(rule.pattern, rule.replacement);
    if (value !== before) {
      corrections.push({
        original: ingredient,
        corrected: value,
        confidence: rule.confidence,
        source: "ocr_dictionary"
      });
    }
  });

  return { value, corrections };
}

function translateIngredient(ingredient) {
  const translated = TRANSLATION_INDEX.get(normalizeInciKey(ingredient));
  if (!translated) return null;

  return {
    original: ingredient,
    corrected: translated.canonical,
    confidence: 1,
    source: "inci_translation",
    language: translated.language
  };
}

function cleanIngredientToken(value) {
  return String(value || "")
    .replace(/^(?:ingredients?|ingre[dl]ients?|ngredients?|credients?|inci|состав)\s*[:：-]?\s*/i, "")
    .replace(/\((?:[^)]{1,40})\)/g, " ")
    .replace(/[•*]+/g, " ")
    .replace(/\bayy\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}0-9(]+|[^\p{L}0-9).%+-]+$/gu, "")
    .replace(/[.]+$/g, "")
    .trim();
}

function prepareIngredientSeparators(text) {
  return String(text || "")
    .replace(/\bCETEARYL\s+CETEARETH\s+RYLIC\/CAPRIC\s+TRIGLYCERIDE\b/gi, "Cetearyl Alcohol, Caprylic/Capric Triglyceride")
    .replace(/\bNP\s+CERAMIDE\b/gi, "Ceramide NP,")
    .replace(/\bCERAMIDE\s+BEHENTRIMA\s*\+\s*CERAMIDE\s+EOP\b/gi, "Behentrimonium Methosulfate, Ceramide EOP")
    .replace(/\bDISODIUM\s+XANTHAN\s+[O0О]\s*,?\s*PHOSPHATE\b/gi, "Disodium Phosphate, Xanthan Gum")
    .replace(/\.\s+(?=[A-ZА-Я][A-ZА-Я0-9+\-/]{1,}(?:\s|,|$))/g, ", ")
    .replace(/\s+[-–—]{2,}\s+/g, ", ");
}

function isPlausibleIngredientToken(item) {
  if (!item || item.length < 2) return false;
  if (END_MARKER.test(item) || ADDRESS_OR_LABEL_NOISE.test(item)) return false;
  if (/^(?:only|for external use|avoid contact|keep out|warning|caution|directions?|предупреждение|только для|при возникновении)$/i.test(item)) {
    return false;
  }
  if (/^[a-z]{2,4}$/i.test(item) && !candidateMatch(item)) return false;
  const letters = item.match(/\p{L}/gu) || [];
  if (letters.length < 2) return false;
  const asciiLetters = item.match(/[A-Za-z]/g) || [];
  const cyrillicLetters = item.match(/[А-Яа-яЁё]/g) || [];
  if (cyrillicLetters.length > asciiLetters.length && !candidateMatch(item)) return false;
  return true;
}

function splitIngredientTokens(text) {
  return prepareIngredientSeparators(text)
    .replace(/(\d),(\d)/g, "$1§$2")
    .split(/[,;\n]+/)
    .map((item) => item.replace(/§/g, ","))
    .map(cleanIngredientToken)
    .filter(isPlausibleIngredientToken);
}

function mergeBrokenTokens(tokens) {
  const merged = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];
    const next2 = tokens[index + 2];

    if (next && !candidateMatch(current)) {
      const two = `${current} ${next}`.replace(/\s+/g, " ").trim();
      if (candidateMatch(two)) {
        merged.push(two);
        index += 1;
        continue;
      }

      if (next2) {
        const three = `${current} ${next} ${next2}`.replace(/\s+/g, " ").trim();
        if (candidateMatch(three)) {
          merged.push(three);
          index += 2;
          continue;
        }
      }
    }

    merged.push(current);
  }
  return merged;
}

function candidateMatch(ingredient) {
  const key = normalizeInciKey(ingredient);
  if (EXPERT_INDEX.has(key)) {
    return { canonical: EXPERT_INDEX.get(key), type: "expert", confidence: 1 };
  }

  const cosing = findCosIngIngredient(ingredient);
  if (!cosing) return null;

  return {
    canonical: cosing.name,
    type: cosing.match?.type || "cosing",
    confidence: cosing.match?.confidence ?? 1,
    suggested_match: cosing.match?.suggested_match || cosing.name,
    functions: cosing.functions || []
  };
}

function normalizeIngredient(ingredient) {
  const translation = translateIngredient(ingredient);
  const translatedIngredient = translation?.corrected || ingredient;
  const dictionary = applyOcrDictionary(translatedIngredient);
  const corrected = cleanIngredientToken(dictionary.value);
  const match = candidateMatch(corrected);
  const suggestions = [];
  const autoCorrections = [...(translation ? [translation] : []), ...dictionary.corrections];

  SUSPICIOUS_HINTS.forEach((hint) => {
    if (hint.pattern.test(ingredient)) {
      suggestions.push({
        original: ingredient,
        suggested_match: hint.suggested_match,
        confidence: hint.confidence,
        reason: hint.reason
      });
    }
  });

  if (match?.confidence > 0.95) {
    if (normalizeInciKey(match.canonical) !== normalizeInciKey(corrected)) {
      autoCorrections.push({
        original: ingredient,
        corrected: match.canonical,
        confidence: Number(match.confidence.toFixed(3)),
        source: match.type
      });
    }
    return { ingredient: match.canonical, autoCorrections, suggestions };
  }

  if (match?.confidence >= 0.8) {
    suggestions.push({
      original: ingredient,
      suggested_match: match.suggested_match || match.canonical,
      confidence: Number(match.confidence.toFixed(3)),
      reason: "Похоже на INCI, но уверенность ниже порога автоисправления."
    });
  }

  return { ingredient: corrected, autoCorrections, suggestions };
}

function uniqueByNormalized(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeInciKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function estimateConfidence({ ingredients, suggestions, cleanedText }) {
  if (!ingredients.length) return 0;
  const withMatches = ingredients.filter((ingredient) => candidateMatch(ingredient)).length;
  const matchRatio = withMatches / ingredients.length;
  const suggestionPenalty = Math.min(0.25, suggestions.length * 0.04);
  const textPenalty = cleanedText.length < 25 ? 0.25 : 0;
  return Math.max(0.1, Math.min(0.99, Number((0.35 + matchRatio * 0.6 - suggestionPenalty - textPenalty).toFixed(2))));
}

export function cleanInciText(rawText) {
  const cleanedText = extractInciBlock(rawText);
  const rawIngredients = mergeBrokenTokens(splitIngredientTokens(cleanedText));
  const autoCorrections = [];
  const suggestions = [];
  const normalizedIngredients = rawIngredients.map((ingredient) => {
    const normalized = normalizeIngredient(ingredient);
    autoCorrections.push(...normalized.autoCorrections);
    suggestions.push(...normalized.suggestions);
    return normalized.ingredient;
  });
  const ingredients = uniqueByNormalized(normalizedIngredients);

  return {
    cleanedText: ingredients.join(", "),
    extractedBlock: cleanedText,
    ingredients,
    autoCorrections,
    suggestions,
    confidence: estimateConfidence({ ingredients, suggestions, cleanedText })
  };
}
