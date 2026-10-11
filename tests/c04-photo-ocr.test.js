import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRetryAngles,
  computeTextCrop,
  scoreOcrCandidate,
  selectBestOcrCandidate
} from "../public/photo-ocr.js";
import { classifyPhotoText } from "../src/services/photoTextClassifier.js";
import { app } from "../src/server.js";

test("C04: INCI-like OCR outranks address and instruction noise", () => {
  const noisy = { text: "Manufacturer LLC New York 10001 Warning keep away", confidence: 94, words: [] };
  const inci = { text: "INGREDIENTS: Aqua, Glycerin, Niacinamide, Panthenol", confidence: 78, words: [] };
  assert.ok(scoreOcrCandidate(inci) > scoreOcrCandidate(noisy));
  assert.equal(selectBestOcrCandidate([noisy, inci]), inci);
});

test("C04: text crop uses multiple OCR boxes and keeps padding inside the image", () => {
  const crop = computeTextCrop([
    { text: "Ingredients", confidence: 91, bbox: { x0: 100, y0: 200, x1: 420, y1: 250 } },
    { text: "Aqua", confidence: 95, bbox: { x0: 120, y0: 270, x1: 210, y1: 315 } },
    { text: "Glycerin", confidence: 94, bbox: { x0: 230, y0: 270, x1: 390, y1: 315 } },
    { text: "Panthenol", confidence: 92, bbox: { x0: 115, y0: 330, x1: 310, y1: 380 } }
  ], 1000, 1200);
  assert.ok(crop);
  assert.ok(crop.x < 100 && crop.y < 200);
  assert.ok(crop.x + crop.width <= 1000);
  assert.ok(crop.y + crop.height <= 1200);
  assert.ok(crop.areaRatio < 0.5);
  assert.equal(computeTextCrop([{ text: "Aqua", bbox: { x0: 1, y0: 1, x1: 20, y1: 10 } }], 100, 100), null);
});

test("C04: rotations are retried only after a weak first pass", () => {
  assert.deepEqual(buildRetryAngles({ confidence: 88, text: "INGREDIENTS: Aqua, Glycerin, Panthenol" }), []);
  assert.deepEqual(buildRetryAngles({ confidence: 30, text: "aq" }), [90, 270, 180]);
});

test("C04: photo text kinds are separated before product resolution", () => {
  const composition = classifyPhotoText({
    text: "INGREDIENTS: Aqua, Glycerin, Panthenol, Phenoxyethanol",
    cleaned: { ingredients: ["Aqua", "Glycerin", "Panthenol", "Phenoxyethanol"] }
  });
  const front = classifyPhotoText({ text: "CeraVe Moisturizing Cream 454 g", cleaned: { ingredients: [] }, product: { id: "cerave" } });
  const barcode = classifyPhotoText({ text: "EAN 3606000537637", cleaned: { ingredients: [] } });
  const unknown = classifyPhotoText({ text: "Warning manufacturer address", cleaned: { ingredients: [] } });

  assert.equal(composition.kind, "inci");
  assert.equal(front.kind, "front");
  assert.equal(barcode.kind, "barcode");
  assert.equal(barcode.barcode, "3606000537637");
  assert.equal(unknown.kind, "unknown");
});

test("C04: an ingredient marker with unresolved medical text is never classified as a front label", () => {
  const result = classifyPhotoText({
    text: "INGREDIENTS: Aqua, Prilocaine Hydrochloride, Glycerin",
    cleaned: {
      ingredients: ["Aqua", "Prilocaine Hydrochloride", "Glycerin"],
      entries: [
        { ingredient: "Aqua", status: "confirmed" },
        { ingredient: "Prilocaine Hydrochloride", status: "unknown" },
        { ingredient: "Glycerin", status: "confirmed" }
      ]
    },
    product: { id: "wrong-cosmetic-candidate" }
  });
  assert.equal(result.kind, "inci");
  assert.equal(result.preservedUnknowns.includes("Prilocaine Hydrochloride"), true);
});

async function withServer(testFunction) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address();
    await testFunction(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("C04: photo resolver keeps an unresolved medical ingredient in an INCI response", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/photo/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "INGREDIENTS: Aqua, Prilocaine Hydrochloride, Glycerin, Panthenol. Warning: external use." })
    });
    const resolution = await response.json();
    assert.equal(resolution.mode, "composition");
    assert.equal(resolution.labelType, "inci");
    assert.ok(resolution.entries.some((entry) => entry.ingredient === "Prilocaine Hydrochloride" && entry.status === "unknown"));
    assert.match(resolution.composition, /Prilocaine Hydrochloride/);
  });
});

test("C04: photo resolver returns barcode and front label as different modes", async () => {
  await withServer(async (baseUrl) => {
    const post = async (text) => (await fetch(`${baseUrl}/api/photo/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    })).json();
    const barcode = await post("EAN 3606000537637");
    const front = await post("Trixosil 5% Professional Hair Growth Complex 50 ml");
    assert.equal(barcode.mode, "barcode");
    assert.equal(barcode.barcode, "3606000537637");
    assert.equal(front.mode, "product");
    assert.equal(front.labelType, "front");
    assert.match(front.product.brand, /Trixosil/i);
  });
});
