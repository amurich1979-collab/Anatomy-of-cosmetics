import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnalysisHistoryEntry,
  buildReanalysisRequest,
  inspectAnalysisHistoryEntry,
  sanitizeHistoryEntryForPrivacy
} from "../public/history-snapshot.js";
import { app } from "../src/server.js";

function analysisFixture({ summary = "Исходный вывод", algorithmVersion = "rules-v1" } = {}) {
  return {
    summary,
    formulaType: "увлажняющее средство",
    score: { score: 7 },
    historyPolicy: { mode: "standard" },
    evidenceVersions: { rules: "rules-v1", knowledge: "knowledge-v1" },
    personalization: {
      profileProvided: false,
      profile: { allergens: ["Private allergen"] },
      usedInputs: [{ field: "allergens", value: ["Private allergen"] }]
    },
    analysisContract: {
      schemaVersion: "1.0",
      algorithmVersion,
      generatedAt: "2026-09-30T10:00:00.000Z",
      evidenceVersions: { rules: "rules-v1", knowledge: "knowledge-v1", registry: "registry-v1" },
      product: {
        identity: { id: "product-1", barcode: "4601234567890", brand: "Fixture", name: "Cream" },
        identificationStatus: "confirmed",
        source: { name: "Brand card", type: "official_brand_page", url: "https://example.test/product", retrievedAt: "2026-09-01T00:00:00.000Z" }
      },
      formula: {
        scope: "full",
        version: "RU 2026",
        market: "RU",
        rawText: "Aqua, Glycerin",
        normalizedText: "Aqua, Glycerin",
        source: { name: "Brand card", type: "official_brand_page", url: "https://example.test/formula", retrievedAt: "2026-09-01T00:00:00.000Z" }
      },
      metrics: { knowledgeCoverage: { value: 1, status: "measured", confirmed: 2, suggested: 0, unknown: 0, total: 2 } },
      assessment: { status: "assessed", reason: null },
      profile: { allergens: ["Private allergen"] },
      personalization: { profile: { allergens: ["Private allergen"] }, usedInputs: [{ field: "allergens" }] }
    },
    photo: "data:image/jpeg;base64,PRIVATE"
  };
}

test("T17: completed history stores an immutable provenance snapshot without profile or photo", () => {
  const entry = buildAnalysisHistoryEntry({
    text: "Aqua, Glycerin",
    productName: "Fixture Cream",
    profile: { allergens: ["Private allergen"] }
  }, analysisFixture(), "Brand card");

  assert.equal(entry.payload.snapshot.status, "completed");
  assert.equal(entry.payload.snapshot.capturedAt, "2026-09-30T10:00:00.000Z");
  assert.equal(entry.payload.snapshot.algorithmVersion, "rules-v1");
  assert.equal(entry.payload.snapshot.evidenceVersions.registry, "registry-v1");
  assert.equal(entry.payload.snapshot.formula.source.name, "Brand card");
  assert.equal(entry.payload.snapshot.formula.version, "RU 2026");
  assert.equal(entry.payload.snapshot.completeness.formulaScope, "full");
  assert.equal(entry.payload.snapshot.confirmations.ingredients.confirmed, 2);
  assert.deepEqual(entry.payload.snapshot.result.analysisContract.profile, {});
  assert.deepEqual(entry.payload.snapshot.result.personalization.usedInputs, []);
  assert.doesNotMatch(JSON.stringify(entry), /Private allergen|data:image|"photo"/);
});

test("T17: a legacy record remains historical and a failed analysis cannot become a success", () => {
  const legacy = {
    kind: "analysis",
    title: "Legacy",
    createdAt: "2025-01-01T00:00:00.000Z",
    payload: { composition: "Aqua", analysis: { summary: "Старый вывод", formulaType: "крем" } }
  };
  const inspected = inspectAnalysisHistoryEntry(legacy);
  assert.equal(inspected.status, "legacy");
  assert.match(inspected.legacyNotice, /Старая запись/);
  assert.equal(inspected.analysis.summary, "Старый вывод");
  assert.equal(buildAnalysisHistoryEntry({ text: "Aqua" }, { error: "timeout" }), null);
  assert.equal(inspectAnalysisHistoryEntry({ kind: "analysis", payload: { composition: "Aqua" } }).status, "invalid");
});

test("T17: reanalysis preserves source and creates a separate result", () => {
  const oldEntry = buildAnalysisHistoryEntry({ text: "Aqua, Glycerin", productName: "Fixture Cream" }, analysisFixture(), "Brand card");
  const request = buildReanalysisRequest(oldEntry);
  assert.equal(request.evidence.formula.source.name, "Brand card");
  assert.equal(request.evidence.formula.version, "RU 2026");
  assert.equal(request.evidence.formula.market, "RU");
  assert.deepEqual(request.profile, {});

  const newEntry = buildAnalysisHistoryEntry(request, analysisFixture({ summary: "Новый вывод", algorithmVersion: "rules-v2" }), "Brand card", {
    capturedAt: "2026-10-01T10:00:00.000Z"
  });
  assert.equal(inspectAnalysisHistoryEntry(oldEntry).analysis.summary, "Исходный вывод");
  assert.equal(inspectAnalysisHistoryEntry(oldEntry).snapshot.algorithmVersion, "rules-v1");
  assert.equal(inspectAnalysisHistoryEntry(newEntry).analysis.summary, "Новый вывод");
  assert.equal(inspectAnalysisHistoryEntry(newEntry).snapshot.algorithmVersion, "rules-v2");
  assert.notEqual(oldEntry, newEntry);
});

test("T17: privacy migration removes media and stored profile from old local entries", () => {
  const safe = sanitizeHistoryEntryForPrivacy({
    payload: {
      profile: { context: "Private context" },
      imageData: "data:image/jpeg;base64,PRIVATE",
      analysis: analysisFixture()
    }
  });
  assert.equal("profile" in safe.payload, false);
  assert.equal("imageData" in safe.payload, false);
  assert.deepEqual(safe.payload.analysis.personalization.profile, {});
  assert.doesNotMatch(JSON.stringify(safe), /Private context|Private allergen|data:image/);
});

test("T17: history read, write and deletion still require authentication", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const [method, path, body] of [
    ["GET", "/api/user/history", null],
    ["POST", "/api/user/history", { kind: "analysis", title: "No access", payload: {} }],
    ["DELETE", "/api/user/history", null]
  ]) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    assert.equal(response.status, 401, `${method} ${path}`);
  }
});
