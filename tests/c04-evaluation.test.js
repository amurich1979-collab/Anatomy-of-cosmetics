import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { result } from "../scripts/run-c04-evaluation.mjs";

test("C04: acceptance stays open without independent readable gold", () => {
  assert.equal(result.status, "partial");
  assert.equal(result.acceptance.officialMetrics.status, "not_evaluated");
  assert.equal(result.acceptance.officialMetrics.readableGoldPhotos, 0);
  assert.equal(result.acceptance.officialMetrics.passed, false);
  assert.equal(result.acceptance.thresholds.precision, 0.99);
  assert.equal(result.acceptance.thresholds.recall, 0.95);
  assert.equal(result.acceptance.thresholds.automaticallyAcceptedReadableShare, 0.8);
});

test("C04: the before/after diagnostic uses exactly the same cases", () => {
  assert.equal(result.provisionalDiagnostic.sameCasesAsBaseline, true);
  assert.equal(result.provisionalDiagnostic.corpusCaseIds.length, 4);
  assert.equal(result.provisionalDiagnostic.ingredientPhotos.records, 3);
  assert.equal(result.provisionalDiagnostic.ingredientPhotos.rejectedForClarification, 3);
  assert.equal(result.provisionalDiagnostic.ingredientPhotos.automaticallyAccepted, 0);
  assert.equal(result.provisionalDiagnostic.frontLabelPhotos.records, 1);
});

test("C04: alternatives are proposals rather than fabricated benchmark results", () => {
  assert.equal(result.engineComparison.measuredOnSameDiagnosticCorpus.length, 2);
  assert.ok(result.engineComparison.notBenchmarked.some((item) => item.engine.includes("PaddleOCR")));
  assert.ok(result.engineComparison.notBenchmarked.every((item) => !Object.hasOwn(item, "precision")));
  assert.match(result.engineComparison.proposedNextEngine, /PaddleOCR/u);
});

test("C04: generated machine and human-readable reports exist", () => {
  const json = new URL("../audit/c04/evaluation.json", import.meta.url);
  const markdown = new URL("../audit/c04/evaluation.md", import.meta.url);
  assert.equal(fs.existsSync(json), true);
  assert.equal(fs.existsSync(markdown), true);
});
