import { claimRevisionHash, claimRevisionSnapshot, reviewContentHash } from "../../src/services/expertKnowledge.js";

// Synthetic signoffs are for isolated tests only and must never enter the production knowledge file.
export function sealFixtureRevision(claim) {
  claim.versionHistory = [{ version: claim.version, changedAt: "2026-10-03", change: "TEST FIXTURE ONLY",
    snapshot: claimRevisionSnapshot(claim), contentHash: claimRevisionHash(claim), previousHash: null }];
}

export function approveFixtureClaim(dataset, claim) {
  dataset.reviewers = [{ id: "test-human", kind: "human", name: "TEST FIXTURE ONLY", qualification: "Synthetic qualification",
    verification: { verifiedBy: "TEST ONLY", verifiedAt: "2026-10-03", artifactRef: "reviews/test-identity.txt" } }];
  for (const source of dataset.sources) source.artifactRef = "artifacts/test-source.txt";
  claim.evidenceStatus = "verified";
  sealFixtureRevision(claim);
  claim.review = { status: "approved", reviewerId: "test-human", reviewer: "TEST FIXTURE ONLY", reviewedAt: "2026-10-03",
    claimVersion: claim.version, artifactRef: "reviews/test-signoff.txt", contentHash: reviewContentHash(claim, dataset.sources) };
}
