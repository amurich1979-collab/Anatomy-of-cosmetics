const INCI_MARKER = /\b(?:ingredients?|inci)\b|\bсостав\b/i;
const INCI_HINT = /\b(?:aqua|water|glycerin|glycol|acid|alcohol|extract|oil|parfum|phenoxyethanol|niacinamide|panthenol|ceramide)\b/gi;
const LABEL_NOISE = /\b(?:manufacturer|distributor|warning|directions?|address|made\s+in|barcode|phone|www)\b|производитель|изготовитель|предосторожности|способ\s+применения/gi;

export function scoreOcrCandidate(candidate = {}) {
  const text = String(candidate.text || "").trim();
  if (!text) return 0;
  const confidence = Number.isFinite(candidate.confidence) ? Math.max(0, Math.min(100, candidate.confidence)) : 0;
  const commaCount = (text.match(/[,;]/g) || []).length;
  const hints = new Set((text.match(INCI_HINT) || []).map((item) => item.toLowerCase())).size;
  const noise = (text.match(LABEL_NOISE) || []).length;
  return confidence * 0.3
    + Math.min(24, text.length / 18)
    + Math.min(32, commaCount * 3)
    + Math.min(30, hints * 5)
    + (INCI_MARKER.test(text) ? 40 : 0)
    - Math.min(45, noise * 12);
}

export function selectBestOcrCandidate(candidates = []) {
  return candidates.reduce((best, candidate) => (
    !best || scoreOcrCandidate(candidate) > scoreOcrCandidate(best) ? candidate : best
  ), null);
}

export function buildRetryAngles(firstPass = {}) {
  const confidence = Number(firstPass.confidence) || 0;
  const text = String(firstPass.text || "");
  const hasStructuredText = INCI_MARKER.test(text) || (text.match(/[,;]/g) || []).length >= 2;
  if (confidence >= 72 && text.trim().length >= 24 && hasStructuredText) return [];
  return [90, 270, 180];
}

export function computeTextCrop(words = [], width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const boxes = words
    .filter((word) => String(word?.text || "").trim().length >= 2)
    .map((word) => word.bbox)
    .filter((bbox) => bbox && [bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite));
  if (boxes.length < 3) return null;

  const paddingX = Math.round(width * 0.04);
  const paddingY = Math.round(height * 0.04);
  const x0 = Math.max(0, Math.min(...boxes.map((box) => box.x0)) - paddingX);
  const y0 = Math.max(0, Math.min(...boxes.map((box) => box.y0)) - paddingY);
  const x1 = Math.min(width, Math.max(...boxes.map((box) => box.x1)) + paddingX);
  const y1 = Math.min(height, Math.max(...boxes.map((box) => box.y1)) + paddingY);
  const cropWidth = Math.max(0, x1 - x0);
  const cropHeight = Math.max(0, y1 - y0);
  const areaRatio = (cropWidth * cropHeight) / (width * height);
  if (cropWidth < 80 || cropHeight < 40 || areaRatio < 0.015 || areaRatio > 0.9) return null;
  return { x: x0, y: y0, width: cropWidth, height: cropHeight, areaRatio };
}

function canvas(width, height) {
  const element = document.createElement("canvas");
  element.width = Math.max(1, Math.round(width));
  element.height = Math.max(1, Math.round(height));
  return element;
}

function enhanceContrast(target) {
  const context = target.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, target.width, target.height);
  const histogram = new Uint32Array(256);
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = Math.round(image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114);
    histogram[luminance] += 1;
  }
  const pixels = target.width * target.height;
  const percentile = (fraction) => {
    const threshold = pixels * fraction;
    let total = 0;
    for (let value = 0; value < 256; value += 1) {
      total += histogram[value];
      if (total >= threshold) return value;
    }
    return fraction < 0.5 ? 0 : 255;
  };
  const low = percentile(0.04);
  const high = Math.max(low + 32, percentile(0.96));
  const scale = 255 / (high - low);
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
    const value = Math.max(0, Math.min(255, Math.round((luminance - low) * scale)));
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return target;
}

export async function preparePhotoSource(file, { maxPixels = 40_000_000, maxEdge = 2200 } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (bitmap.width * bitmap.height > maxPixels) throw new Error("Фото слишком большое: уменьшите его до 40 мегапикселей.");
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const target = canvas(bitmap.width * scale, bitmap.height * scale);
    const context = target.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    return target;
  } finally {
    bitmap.close();
  }
}

export function createOcrCanvas(source, { angle = 0, crop = null, enhance = true } = {}) {
  const sx = crop?.x || 0;
  const sy = crop?.y || 0;
  const sw = crop?.width || source.width;
  const sh = crop?.height || source.height;
  const quarterTurn = Math.abs(angle) % 180 === 90;
  const target = canvas(quarterTurn ? sh : sw, quarterTurn ? sw : sh);
  const context = target.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, target.width, target.height);
  context.translate(target.width / 2, target.height / 2);
  context.rotate((angle * Math.PI) / 180);
  context.drawImage(source, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  return enhance ? enhanceContrast(target) : target;
}

export async function runPhotoOcr({ file, recognize, isCurrent = () => true, onPass = () => {} }) {
  const source = await preparePhotoSource(file);
  if (!isCurrent()) return null;
  const candidates = [];
  const run = async (input, metadata) => {
    onPass(metadata);
    const data = await recognize(input, metadata);
    if (!isCurrent()) return null;
    const candidate = {
      text: String(data?.text || ""),
      confidence: Number.isFinite(data?.confidence) ? data.confidence : null,
      words: data?.words || [],
      lines: data?.lines || [],
      preprocessing: metadata
    };
    candidates.push(candidate);
    return candidate;
  };

  const initialCanvas = createOcrCanvas(source, { enhance: true });
  const first = await run(initialCanvas, { mode: "contrast", angle: 0, crop: null });
  if (!first) return null;

  const crop = computeTextCrop(first.words, initialCanvas.width, initialCanvas.height);
  if (crop && isCurrent()) {
    await run(createOcrCanvas(initialCanvas, { crop, enhance: true }), { mode: "text_crop", angle: 0, crop });
  }

  const bestBeforeRotation = selectBestOcrCandidate(candidates);
  for (const angle of buildRetryAngles(bestBeforeRotation)) {
    if (!isCurrent()) return null;
    const rotated = await run(createOcrCanvas(source, { angle, enhance: true }), { mode: "rotation", angle, crop: null });
    if (rotated && buildRetryAngles(rotated).length === 0) break;
  }

  const best = selectBestOcrCandidate(candidates);
  return best ? { ...best, candidates: candidates.map((item) => ({
    confidence: item.confidence,
    score: scoreOcrCandidate(item),
    textLength: item.text.length,
    preprocessing: item.preprocessing
  })) } : null;
}
