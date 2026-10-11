import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const spec = JSON.parse(readFileSync(new URL('../data/formula-system-rules.c08.json', import.meta.url), 'utf8'));
const systemIds = ['water_phase', 'humectants', 'emollients', 'lipid_phase', 'oils',
  'barrier_lipids', 'emulsification', 'surfactants', 'rheology', 'preservation',
  'fragrance', 'actives', 'uv_filters'];

// These tests validate the review package, not an implemented system evaluator.
test('C08: draft is isolated from publication and has no invented approval', () => {
  assert.equal(spec.schemaVersion, 'c08-draft-1');
  assert.equal(spec.version, '0.1.0');
  assert.equal(spec.publicationStatus, 'staged_not_runtime');
  assert.equal(spec.runtimeEligible, false);
  assert.deepEqual(spec.review, { status: 'pending', reviewer: null, artifact: null });
  assert.equal(spec.examplesOrigin, 'synthetic_design_cases_not_products_not_gold');
});

test('C08: all C01 systems have independently specified draft rules', () => {
  assert.equal(new Set(spec.rules.map(rule => rule.id)).size, spec.rules.length);
  assert.deepEqual([...new Set(spec.rules.map(rule => rule.systemId))].sort(), [...systemIds].sort());
  for (const id of systemIds) {
    assert.ok(spec.rules.some(rule => rule.systemId === id && rule.status === 'source_backed_draft'));
  }
  for (const rule of spec.rules) {
    assert.match(rule.id, /^C08-[SR]\d{2}$/);
    assert.equal(rule.version, spec.version);
    assert.ok(rule.inputs.length >= 3, rule.id);
    assert.ok(rule.unknownConditions.length >= 2, rule.id);
    assert.ok(rule.forbiddenConclusions.length, rule.id);
    for (const kind of ['positive', 'counterexample', 'unknown']) {
      assert.ok(rule[kind].input.length > 20, `${rule.id}: ${kind} input`);
      assert.ok(rule[kind].expect.length > 20, `${rule.id}: ${kind} expectation`);
    }
  }
});

test('C08: every source-backed rule resolves its scoped evidence and locator', () => {
  const sources = new Map(spec.sources.map(source => [source.id, source]));
  assert.equal(sources.size, spec.sources.length);
  for (const source of sources.values()) {
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.ok(source.scope);
    assert.ok(source.readScope);
    assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const rule of spec.rules) {
    if (rule.status === 'source_backed_draft') {
      assert.ok(rule.sourceRefs.length, rule.id);
      assert.ok(rule.allowedText?.length > 20, rule.id);
      assert.notEqual(rule.claimLevel, 'none');
    } else {
      assert.equal(rule.status, 'research_proposal');
      assert.equal(rule.claimLevel, 'none');
      assert.equal(rule.allowedText, null);
      assert.deepEqual(rule.sourceRefs, []);
    }
    for (const ref of rule.sourceRefs) {
      assert.ok(sources.has(ref.id), `${rule.id}: ${ref.id}`);
      assert.ok(ref.locator?.length > 10, rule.id);
      assert.ok(ref.supports?.length > 10, rule.id);
    }
  }
});

test('C08: scoped literature is not labelled a finished-product test', () => {
  for (const source of spec.sources.filter(source => source.id.startsWith('PMID-'))) {
    assert.equal(source.readScope, 'abstract_only');
    assert.match(source.scope, /^studied_/);
  }
  for (const rule of spec.rules) {
    assert.notEqual(rule.claimLevel, 'product_test_result');
    assert.notEqual(rule.claimLevel, 'regulatory_restriction');
  }
  assert.equal(spec.rules.filter(rule => rule.status === 'research_proposal').length, 1);
});
