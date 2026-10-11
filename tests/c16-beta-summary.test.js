import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultPath = path.join(root, "audit/c16/summary.json");

function run(inputPath) {
  return spawnSync(process.execPath, ["scripts/run-c16-beta-summary.mjs", ...(inputPath ? [inputPath] : [])], {
    cwd: root,
    encoding: "utf8"
  });
}

test("C16: blocked study does not turn synthetic records into launch approval", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "c16-summary-test-"));
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
  const input = path.join(temp, "synthetic-only.json");
  const base = JSON.parse(fs.readFileSync(path.join(root, "docs/C16_BETA_TEMPLATE.json"), "utf8"));
  const comprehension = { purposeCorrect: true, limitCorrect: true, uncertaintyCorrect: true };
  base.studyId = "synthetic-test-only";
  base.publicationApproval = { grantedAt: "2026-01-01T00:00:00Z", reference: "synthetic-fixture" };
  base.sessions = [
    {
      participantId: "fixture-a", scenarioId: "fixture-cream", expertReferenceId: "synthetic-review-a",
      inputMode: "photo", category: "cream_or_lotion", device: { platform: "android" }, network: "wifi",
      submittedAt: "2026-01-01T00:00:00Z", resultAt: "2026-01-01T00:00:20Z",
      outcome: "report", refusalReason: null, unassisted: true, comprehension,
      criticalIssueConfirmed: false
    },
    {
      participantId: "fixture-b", scenarioId: "fixture-spf", expertReferenceId: "synthetic-review-b",
      inputMode: "barcode", category: "spf", device: { platform: "ios" }, network: "mobile",
      submittedAt: "2026-01-01T00:00:00Z", resultAt: "2026-01-01T00:00:04Z",
      outcome: "safe_refusal", refusalReason: "product_missing", unassisted: true,
      comprehension: { purposeCorrect: null, limitCorrect: null, uncertaintyCorrect: null },
      criticalIssueConfirmed: false
    }
  ];
  try {
    fs.writeFileSync(input, JSON.stringify(base), "utf8");
    const completed = run(input);
    assert.equal(completed.status, 1, completed.stderr);
    const summary = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    assert.equal(summary.launchGate.allowed, false);
    assert.equal(summary.sample.participants, 2);
    assert.equal(summary.outcomes.rates.report, 0.5);
    assert.equal(summary.outcomes.rates.safe_refusal, 0.5);
    assert.equal(summary.understanding.rate, 0.5);
    assert.equal(summary.timing.p90ReportSeconds, 20);
    assert.deepEqual(summary.timing.byDevice.android, { observed: 1, p90ReportSeconds: 20 });
    assert.deepEqual(summary.timing.byNetwork.wifi, { observed: 1, p90ReportSeconds: 20 });
    assert.equal(summary.outcomes.refusalReasons.product_missing, 1);
    base.sessions[1].participantId = "fixture-a";
    fs.writeFileSync(input, JSON.stringify(base), "utf8");
    const duplicate = run(input);
    assert.equal(duplicate.status, 1);
    assert.equal(JSON.parse(fs.readFileSync(resultPath, "utf8")).status, "invalid_input");
  } finally {
    const restored = run();
    assert.equal(restored.status, 1);
    assert.equal(JSON.parse(fs.readFileSync(resultPath, "utf8")).sample.participants, 0);
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
