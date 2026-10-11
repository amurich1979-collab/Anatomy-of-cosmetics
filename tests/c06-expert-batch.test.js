import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateExpertCardBatch, summarizeExpertCardBatch, REQUIRED_FUNCTIONAL_CLASSES } from "../src/services/expertCardBatch.js";

const batch = JSON.parse(fs.readFileSync(new URL("../data/expert-card-batch-c06.json", import.meta.url), "utf8"));
const audit = JSON.parse(fs.readFileSync(new URL("../audit/c06/coverage.json", import.meta.url), "utf8"));

test("C06 batch contains 50 unique staged cards and all required functional classes", () => {
  assert.deepEqual(validateExpertCardBatch(batch, { expectedCardCount: 50 }), []);
  const summary = summarizeExpertCardBatch(batch);
  assert.equal(summary.cardCount, 50);
  assert.equal(summary.stagedCount, 50);
  assert.equal(summary.approvedCount, 0);
  for (const functionalClass of REQUIRED_FUNCTIONAL_CLASSES) assert.ok(summary.classCounts[functionalClass] > 0, functionalClass);
});

test("C06 selection uses setup only and keeps final as read-only measurement", () => {
  assert.equal(batch.selectionPolicy.selectionPartition, "setup");
  assert.equal(batch.selectionPolicy.heldOutPartition, "final");
  assert.equal(batch.selectionPolicy.finalPartitionUsedForSelection, false);
  assert.ok(batch.cards.every((card) => card.corpusPriority.partition === "setup"));
  assert.equal(audit.selectionPolicy.finalPartitionUsedForSelection, false);
  assert.deepEqual(audit.selectedIngredients.map((item) => item.ingredient), batch.cards.map((card) => card.ingredient.canonicalName));
});

test("C06 does not publish or approve unreviewed domain claims", () => {
  assert.equal(batch.coverage.publishedExpertClaimCount, 0);
  assert.equal(batch.coverage.approvedExpertClaimCount, 0);
  for (const card of batch.cards) {
    assert.equal(card.draftReference.evidenceStatus, "review_required");
    assert.equal(card.draftReference.publicationStatus, "staged_not_runtime");
    assert.equal(card.draftReference.runtimeEligible, false);
    assert.deepEqual(card.draftReference.review, {
      status: "pending",
      reviewerId: null,
      reviewedAt: null,
      artifactRef: null
    });
    assert.ok(card.draftReference.basis.locator.includes(card.ingredient.canonicalName));
    assert.ok(card.draftReference.limitations.length >= 2);
    assert.ok(Object.values(card.assessmentGaps).every((value) => value === "not_assessed"));
  }
});

test("C06 independently includes critical filters, actives and fragrance review priorities", () => {
  const names = new Set(batch.cards.map((card) => card.ingredient.canonicalName));
  for (const name of [
    "Titanium Dioxide",
    "Butyl Methoxydibenzoylmethane",
    "Ethylhexyl Methoxycinnamate",
    "Octocrylene",
    "Salicylic Acid",
    "Retinol",
    "Citral"
  ]) assert.ok(names.has(name), name);
  assert.ok(batch.cards.some((card) => card.researchCandidates.some((candidate) => candidate.sourceId.startsWith("sccs-"))));
});

test("C06 reports coverage honestly instead of declaring the 90 percent target complete", () => {
  assert.ok(batch.coverage.setup.recognizedOccurrenceCoverage > 0);
  assert.ok(batch.coverage.setup.recognizedOccurrenceCoverage < 0.9);
  assert.ok(batch.coverage.setupIngredientsNeededFor90PercentRecognizedOccurrences.ingredientCount > 50);
  assert.equal(batch.coverage.setupIngredientsNeededFor90PercentRecognizedOccurrences.target, 0.9);
});
