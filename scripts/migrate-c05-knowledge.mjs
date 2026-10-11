import fs from "node:fs";
import { claimRevisionHash, claimRevisionSnapshot, validateKnowledge } from "../src/services/expertKnowledge.js";
import { getInciRegistrySnapshot } from "../src/services/ingredientSources/inciRegistry.js";

const file = new URL("../data/expert-claims.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (data.schemaVersion === "2.0") {
  console.log("C05 knowledge already migrated; no changes.");
} else {
  // Only this known pending seed is eligible. No source check or human approval is inferred.
  if (data.schemaVersion !== "1.1" || data.claims.some((claim) => claim.review.status !== "pending")
    || data.sources.some((source) => source.type !== "primary_study_abstract")) throw new Error("Review this dataset before migration.");
  data.schemaVersion = "2.0";
  data.version = "2026-10-03.c05";
  data.reviewers = [];
  for (const source of data.sources) {
    source.version = null;
    source.retrievedAt = null;
    source.publishedAt = null;
    source.contentHash = null;
    source.conditions = structuredClone(data.claims.find((claim) => claim.basis.some((ref) => ref.sourceId === source.id)).conditions);
    source.subject = { kind: "studied_formula", id: `study:${source.id}`, formulaVersion: null };
  }
  for (const claim of data.claims) {
    const previous = { version: claim.version, changedAt: claim.checkedAt, change: "Imported existing pending rule; no new evidence review.",
      snapshot: claimRevisionSnapshot(claim), contentHash: claimRevisionHash(claim), previousHash: null };
    claim.version = "2.0.0";
    claim.conclusionType = "literature_observation";
    claim.subject = structuredClone(data.sources.find((source) => source.id === claim.basis[0].sourceId).subject);
    claim.unknownReasons = ["exact_studied_formula_version_unavailable", "source_full_text_not_checked"];
    claim.lifecycle = { status: "active", changedAt: "2026-10-03", reason: "Schema migration; pending evidence unchanged.", replacedBy: null };
    claim.versionHistory = [previous, { version: claim.version, changedAt: "2026-10-03", change: "C05: explicit study subject, provenance and applicability limits.",
      snapshot: claimRevisionSnapshot(claim), contentHash: claimRevisionHash(claim), previousHash: previous.contentHash }];
  }
  const canonicalNames = new Set(getInciRegistrySnapshot().records.map((row) => row.name.toUpperCase()));
  const errors = validateKnowledge(data, canonicalNames);
  if (errors.length) throw new Error(errors.join("; "));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Migrated ${data.claims.length} pending claims. Human reviewers: 0.`);
}
