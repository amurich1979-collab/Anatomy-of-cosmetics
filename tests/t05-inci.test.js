import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanInciText } from '../src/services/inciCleaner.js';
import { analyzeComposition } from '../src/analyzer.js';
import { createAnalysisContract } from '../src/analysisContract.js';

test('T05: separate Hamamelis forms and trade complex keep identities', () => {
  const text = 'Hamamelis Virginiana Water, Hamamelis Virginiana Leaf Extract, Hamamelis Virginiana Bark/Leaf Extract, Hamamelis Virginiana Extract, RET Complex';
  const analysis = analyzeComposition({ text });
  for (const name of ['Water', 'Leaf Extract', 'Bark/Leaf Extract']) {
    assert.ok(analysis.found.some(x => x.name === `Hamamelis Virginiana ${name}`));
  }
  assert.equal(analysis.unknown[0].name, 'Hamamelis Virginiana Extract');
  const contract = createAnalysisContract({ analysis, request: { text } });
  assert.equal(contract.ingredients[3].status, 'suggested');
  assert.equal(contract.ingredients[3].canonicalName, null);
  assert.equal(analysis.proprietaryComplexes[0].name, 'RET Complex');
});

test('T05: explicit commas cannot be treated as wrapped ingredient names', () => {
  const result = cleanInciText('INCI: Aqua, PEG-40 Hydrogenated, Castor Oil');
  assert.equal(result.ingredients.includes('PEG-40 Hydrogenated Castor Oil'), false);
  assert.equal(result.transformations.some(x => x.type === 'join_lines'), false);
});

test('T05: source occurrences survive analyzer and contract serialization', () => {
  const text = 'INCI: Nacinamide; Aqua; Nacinamide';
  const analysis = analyzeComposition({ text });
  const saved = JSON.parse(JSON.stringify({ analysis, analysisContract: createAnalysisContract({ analysis, request: { text } }) }));
  assert.equal(saved.analysis.inciCleaning.entries[2].duplicateOf, 1);
  for (const entry of saved.analysis.inciCleaning.entries) {
    assert.equal(text.slice(entry.start, entry.end), entry.raw);
  }
  assert.equal(saved.analysisContract.ingredients[0].provenance.raw, 'Nacinamide');
  assert.ok(saved.analysis.inciCleaning.transformations.some(x => x.type === 'ocr_dictionary'));
});

test('T05: numeric tail preserves adjacent INCI and exact source offsets', () => {
  const text = 'INGREDIENTS: Aqua, Glycerin, Niacinamide 1234567890123';
  const result = cleanInciText(text);
  assert.deepEqual(result.ingredients, ['Aqua', 'Glycerin', 'Niacinamide']);
  for (const item of result.entries) {
    assert.equal(text.slice(item.start, item.end), item.raw);
  }
  assert.ok(result.transformations.some(x => x.type === 'remove_metadata'));
});

test('T05: duplicates retain every occurrence and position', () => {
  const result = cleanInciText('INCI: Aqua; Glycerin\nAqua');
  assert.equal(result.entries.length, 3);
  assert.deepEqual(result.entries.map(x => x.position), [1, 2, 3]);
  assert.equal(result.entries[2].duplicateOf, 1);
  assert.ok(result.transformations.some(x => x.type === 'duplicate'));
});

test('T05: uncertain dictionary replacements are suggestions', () => {
  const result = analyzeComposition({ text: 'Aqua, EDTA DIPQTASRONATE, SODIUM RIMONIUN METHOSULFATE' });
  assert.equal(result.found.some(x => /Dipotassium EDTA|Behentrimonium Methosulfate/i.test(x.name)), false);
  assert.ok(result.unknown.some(x => x.suggested_match === 'Dipotassium EDTA'));
});

test('T05: CeraVe-like fragments do not reconstruct missing ingredients', () => {
  const result = cleanInciText('INCI: Aqua, CETEARYL CETEARETH RYLIC/CAPRIC TRIGLYCERIDE, NP CERAMIDE PETROLATUM, DISODIUM XANTHAN O, PHOSPHATE');
  for (const name of ['Cetearyl Alcohol', 'Caprylic/Capric Triglyceride', 'Ceramide NP', 'Petrolatum', 'Disodium Phosphate', 'Xanthan Gum']) {
    assert.equal(result.ingredients.includes(name), false, name);
  }
});

test('T05: polymer, numeric comma, slash and wrapped PEG remain intact', () => {
  const result = cleanInciText('INCI: 1,2-Hexanediol; Hydroxyethyl Acrylate/Sodium Acryloyldimethyl Taurate Copolymer. PEG-\n40 Hydrogenated\nCastor Oil, Nacinamide, Phenoxyethanal');
  assert.equal(result.ingredients.length, 5);
  assert.ok(result.ingredients.includes('1,2-Hexanediol'));
  assert.ok(result.ingredients.includes('PEG-40 Hydrogenated Castor Oil'));
  assert.ok(result.ingredients.includes('Niacinamide'));
  assert.ok(result.transformations.some(x => x.type === 'join_lines'));
});

test('T05: metadata on same line preserves preceding ingredient', () => {
  for (const tail of ['Directions: apply daily', 'www.example.com', '50 ml', 'Тел: +7 999 123 45 67', 'Manufacturer: Example LLC']) {
    assert.deepEqual(cleanInciText(`INCI: Aqua, Glycerin ${tail}`).ingredients, ['Aqua', 'Glycerin'], tail);
  }
});

test('T05: unknown noise is rejected but unknown ingredient within labelled INCI remains reviewable', () => {
  assert.deepEqual(cleanInciText('Qwertyblender, Zxcvbnformula, Plmoknextract').ingredients, []);
  const result = cleanInciText('INCI: Aqua, Novel Ingredient');
  assert.ok(result.entries.some(x => x.ingredient === 'Novel Ingredient' && x.status === 'unknown'));
});
