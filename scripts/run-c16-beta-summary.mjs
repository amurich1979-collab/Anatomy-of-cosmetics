import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.resolve(root, process.argv[2] || "work/c16-beta.json");
const outputPath = path.join(root, "audit/c16/summary.json");
const c15 = JSON.parse(fs.readFileSync(path.join(root, "audit/c15/evaluation.json"), "utf8"));
const empty = JSON.parse(fs.readFileSync(path.join(root, "docs/C16_BETA_TEMPLATE.json"), "utf8"));
const data = fs.existsSync(inputPath) ? JSON.parse(fs.readFileSync(inputPath, "utf8")) : empty;
const errors = [];
if (data.schemaVersion !== "1.0" || data.protocolVersion !== "C16-1" || !Array.isArray(data.sessions)) {
  errors.push("Invalid C16 study schema");
}
const sessions = Array.isArray(data.sessions) ? data.sessions : [];
const modes = new Set(["name", "photo", "barcode"]);
const outcomes = new Set(["report", "safe_refusal", "error", "abandoned"]);
const reasonsByOutcome = {
  safe_refusal: new Set(["product_missing", "no_full_inci", "ocr_uncertain", "barcode_unavailable", "camera_denied", "other"]),
  error: new Set(["external_failure", "application_error", "other"]),
  abandoned: new Set(["user_abandoned", "other"])
};
const seen = new Set();
const durations = [];
const reportDurations = [];
const byMode = {};
const byCategory = {};
const byOutcome = Object.fromEntries([...outcomes].map((key) => [key, 0]));
const byRefusal = {};
const byFailure = {};
const byDevice = {};
const byNetwork = {};
let unassistedAndUnderstood = 0;
let missingTime = 0;
let criticalIssues = 0;

function add(group, key, outcome, understood) {
  const slot = group[key] ||= { total: 0, report: 0, safe_refusal: 0, error: 0, abandoned: 0, understood: 0 };
  slot.total += 1;
  slot[outcome] += 1;
  if (understood) slot.understood += 1;
}

function secondsBetween(start, end) {
  if (!start || !end) return null;
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return null;
  return (endTime - startTime) / 1000;
}

function percentile90(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.9) - 1];
}

for (const [index, session] of sessions.entries()) {
  const prefix = `sessions[${index}]`;
  if (!session || typeof session !== "object") { errors.push(`${prefix}: invalid entry`); continue; }
  if (!session.participantId || seen.has(session.participantId)) errors.push(`${prefix}: missing or duplicate participantId`);
  seen.add(session.participantId);
  if (!session.scenarioId || !session.expertReferenceId) errors.push(`${prefix}: scenario and independent reference required`);
  if (!modes.has(session.inputMode)) errors.push(`${prefix}: invalid inputMode`);
  if (!outcomes.has(session.outcome)) { errors.push(`${prefix}: invalid outcome`); continue; }
  if (!session.category || !session.device?.platform || !session.network) errors.push(`${prefix}: category, device platform and network required`);
  if (typeof session.unassisted !== "boolean") errors.push(`${prefix}: unassisted must be a boolean`);
  if (typeof session.criticalIssueConfirmed !== "boolean") errors.push(`${prefix}: criticalIssueConfirmed must be a boolean`);
  if (session.outcome !== "report" && !reasonsByOutcome[session.outcome].has(session.refusalReason)) {
    errors.push(`${prefix}: reason does not match outcome`);
  }
  if (session.outcome === "report" && session.refusalReason) errors.push(`${prefix}: report cannot have refusalReason`);
  const duration = secondsBetween(session.submittedAt, session.resultAt);
  if (session.outcome === "report" && duration === null) errors.push(`${prefix}: report response time required`);
  if (duration === null) missingTime += 1;
  else {
    durations.push(duration);
    if (session.outcome === "report") {
      reportDurations.push(duration);
      (byDevice[session.device?.platform || "unknown"] ||= []).push(duration);
      (byNetwork[session.network || "unknown"] ||= []).push(duration);
    }
  }
  const comprehension = session.comprehension || {};
  for (const field of ["purposeCorrect", "limitCorrect", "uncertaintyCorrect"]) {
    if (![true, false, null].includes(comprehension[field])) errors.push(`${prefix}: ${field} must be true, false or null`);
  }
  const understood = session.outcome === "report" && session.unassisted === true
    && comprehension.purposeCorrect === true && comprehension.limitCorrect === true
    && comprehension.uncertaintyCorrect === true;
  if (understood) unassistedAndUnderstood += 1;
  if (session.criticalIssueConfirmed === true) criticalIssues += 1;
  byOutcome[session.outcome] += 1;
  if (session.outcome === "safe_refusal") byRefusal[session.refusalReason] = (byRefusal[session.refusalReason] || 0) + 1;
  if (session.outcome === "error") byFailure[session.refusalReason] = (byFailure[session.refusalReason] || 0) + 1;
  if (modes.has(session.inputMode)) add(byMode, session.inputMode, session.outcome, understood);
  if (session.category) add(byCategory, session.category, session.outcome, understood);
}

const count = sessions.length;
const rate = (numerator, denominator) => denominator ? numerator / denominator : null;
const c15Accepted = c15.accepted === true && c15.status === "validated" && !c15.blockers?.length;
const approvalPresent = Boolean(data.publicationApproval?.grantedAt && data.publicationApproval?.reference);
const customerAccepted = Boolean(data.customerAcceptance?.acceptedAt && data.customerAcceptance?.reference);
if (count && !data.studyId) errors.push("studyId required when sessions are present");
if (count && !approvalPresent) errors.push("publication approval reference required for recorded beta sessions");

const summary = {
  schemaVersion: "1.0",
  status: errors.length ? "invalid_input" : "blocked_external",
  protocolVersion: "C16-1",
  launchGate: { c15Accepted, publicationApprovalPresent: approvalPresent, allowed: c15Accepted && approvalPresent },
  customerAcceptancePresent: customerAccepted,
  sample: { participants: count, targetMin: 30, targetMax: 50, targetReached: count >= 30 && count <= 50 },
  outcomes: { counts: byOutcome, rates: Object.fromEntries(Object.entries(byOutcome).map(([key, value]) => [key, rate(value, count)])),
    refusalReasons: byRefusal, failureReasons: byFailure },
  understanding: { succeeded: unassistedAndUnderstood, denominator: count, rate: rate(unassistedAndUnderstood, count), target: 0.8 },
  timing: { observed: durations.length, missing: missingTime, total: count, p90ResponseSeconds: percentile90(durations),
    reportsObserved: reportDurations.length, p90ReportSeconds: percentile90(reportDurations), targetReportSeconds: 30,
    byDevice: Object.fromEntries(Object.entries(byDevice).map(([key, values]) => [key, { observed: values.length, p90ReportSeconds: percentile90(values) }])),
    byNetwork: Object.fromEntries(Object.entries(byNetwork).map(([key, values]) => [key, { observed: values.length, p90ReportSeconds: percentile90(values) }])) },
  criticalIssuesConfirmed: criticalIssues,
  byInputMode: byMode,
  byCategory,
  errors,
  humanFinalReviewRequired: true
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: summary.status, launchGate: summary.launchGate, sample: summary.sample,
  outcomes: summary.outcomes.counts, understanding: summary.understanding, timing: summary.timing,
  criticalIssuesConfirmed: summary.criticalIssuesConfirmed, validationErrors: errors.length }, null, 2));
if (errors.length || !summary.launchGate.allowed || !summary.sample.targetReached || criticalIssues || !customerAccepted) process.exitCode = 1;
