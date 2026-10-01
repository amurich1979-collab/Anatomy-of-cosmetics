import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { app } from "../src/server.js";
import { analyzeComposition } from "../src/analyzer.js";
import { buildAnalysisHistoryEntry, HISTORY_SNAPSHOT_VERSION, inspectAnalysisHistoryEntry } from "../public/history-snapshot.js";

async function withServer(t) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function analyzeHttp(t, body) {
  const baseUrl = await withServer(t);
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("T19: partial photo text retaining Prilocaine cannot become a cosmetic report", async (t) => {
  const result = await analyzeHttp(t, {
    text: "Aqua, Frostoin, Prilocaine Hydrochloride, Glycerin, Panthenol, Phenoxyethanol",
    productName: "Фото состава",
    evidence: { formula: { scope: "partial", source: { name: "Фото", type: "photo_ocr" } } }
  });
  assert.equal(result.productSafety.type, "local_anesthetic");
  assert.equal(result.productSafety.shouldScoreAsCosmetic, false);
  assert.equal(result.assessment.status, "not_assessed");
  assert.equal(result.score.score, null);
  assert.deepEqual(result.positives, []);
  assert.deepEqual(result.routineAdvice, []);
  assert.deepEqual(result.alternatives, []);
  assert.equal(result.alternativeSearch.reason, "source_not_cosmetic");
});

test("T19: unknown positions and partial scope never mean a safe or complete formula", async (t) => {
  const result = await analyzeHttp(t, {
    text: "Aqua, Glycerin, Novelium Complex, Unreadable Fragment",
    productName: "Фото состава",
    evidence: { formula: { scope: "partial", source: { name: "Фото", type: "photo_ocr" } } }
  });
  assert.equal(result.assessment.status, "not_assessed");
  assert.equal(result.assessment.reason, "partial_formula");
  assert.equal(result.score.score, null);
  assert.ok(result.unknown.length >= 1);
  assert.match(result.summary, /не оцениваются|не оценивается/i);
  assert.deepEqual(result.alternatives, []);
});

test("T19: a reported allergen blocks advice and analog ranking", async (t) => {
  const result = await analyzeHttp(t, {
    text: "Aqua, Glycerin, Cetearyl Alcohol, Dimethicone, Panthenol, Phenoxyethanol",
    productName: "Face moisturizer cream",
    profile: { allergens: ["Glycerin"] },
    evidence: {
      formula: { scope: "full" },
      product: {
        identificationStatus: "confirmed",
        name: "Face moisturizer cream",
        category: "Face moisturizer cream",
        useInstructions: "Apply to face and leave on.",
        source: { name: "Brand", type: "official_brand_page", url: "https://example.test/cream" }
      }
    }
  });
  assert.equal(result.personalization.status, "blocked");
  assert.equal(result.personalization.restrictions[0].ruleId, "personal.allergen-match");
  assert.equal(result.personalization.applicationAdviceAllowed, false);
  assert.deepEqual(result.alternatives, []);
  assert.equal(result.alternativeSearch.reason, "source_personal_restriction");
});

test("T19: pending literature records cannot appear as approved product evidence", () => {
  const claims = JSON.parse(fs.readFileSync(new URL("../data/expert-claims.json", import.meta.url), "utf8"));
  assert.ok(claims.claims.length > 0);
  assert.ok(claims.claims.every((claim) => claim.review?.status !== "approved"));
  const analysis = analyzeComposition({
    text: "Aqua, Glycerin, Petrolatum, Panthenol, Phenoxyethanol",
    productName: "Face moisturizer cream",
    formulaScope: "full"
  });
  const literature = analysis.findings.filter((finding) => String(finding.ruleId || "").startsWith("literature."));
  assert.ok(literature.length > 0);
  assert.ok(literature.every((finding) => finding.review.status === "pending"));
  assert.ok(literature.every((finding) => finding.evidenceStatus === "review_required"));
});

test("T19: completed history retains algorithm and evidence versions", () => {
  const analysis = analyzeComposition({ text: "Aqua, Glycerin, Panthenol", formulaScope: "full" });
  analysis.analysisContract = {
    schemaVersion: "1.0",
    algorithmVersion: "test-algorithm",
    generatedAt: "2026-10-01T00:00:00.000Z",
    evidenceVersions: { expert: "test-evidence" },
    product: { identity: {}, identificationStatus: "unknown", source: {} },
    formula: { scope: "full", source: {} },
    metrics: { knowledgeCoverage: { confirmed: 3, suggested: 0, unknown: 0, total: 3 } },
    assessment: { status: analysis.assessment.status }
  };
  const entry = buildAnalysisHistoryEntry({ text: "Aqua, Glycerin, Panthenol" }, analysis, "manual", { capturedAt: "2026-10-01T00:00:00.000Z" });
  const inspected = inspectAnalysisHistoryEntry(entry);
  assert.equal(inspected.status, "snapshot");
  assert.equal(inspected.snapshot.schemaVersion, HISTORY_SNAPSHOT_VERSION);
  assert.equal(inspected.snapshot.algorithmVersion, "test-algorithm");
  assert.equal(inspected.snapshot.evidenceVersions.expert, "test-evidence");
});
