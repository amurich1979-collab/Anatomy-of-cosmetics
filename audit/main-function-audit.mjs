import fs from 'node:fs';
import { analyzeComposition } from '../src/analyzer.js';
import { cleanInciText } from '../src/services/inciCleaner.js';
import { rankSourceProducts } from '../src/services/productSources/index.js';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const summarize = (result) => ({
  count: result.totalIngredients, expert: result.found.filter(i => i.dataSource === 'expert').length,
  registry: result.found.filter(i => i.referenceType === 'inci_registry').length,
  unknown: result.unknown.map(i => i.input), type: result.productSafety.type,
  classificationConfidence: result.productSafety.confidence, confidence: result.confidence,
  score: result.score, quality: result.qualitySummary, scores: result.expertScores,
  routine: result.routineAdvice, positives: result.positives, warnings: result.warnings,
  ingredients: result.found.map(i => ({input: i.input, name: i.name, source: i.dataSource,
    score: i.ingredient_quality_score, confidence: i.match_confidence, role: i.roles})),
  summary: result.summary, cleaning: result.inciCleaning
});
const run = (text, productName = '', profile = {}) => summarize(analyzeComposition({text, productName, profile}));
const expert = read('ingredients-expert');
const registryDocument = read('inci-registry');
const registry = registryDocument.records || [];
const products = read('products');
const cache = read('product-details-cache');
const fixtures = {
  unrecognized: run('Qwertyblender, Zxcvbnformula, Plmoknextract'),
  registryOnly: run('Hydroxyethylcellulose, C10-16 Alkyl Glucoside, Potassium Phosphate'),
  ambiguous: run('Aqua, Hamamelis Virginiana Extract, Glycerin'),
  fattyAcid: run('Aqua, Glycerin, Palmitic Acid, Stearic Acid', 'Moisturizing cream'),
  acidCleanser: run('Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Lactic Acid', 'Face cleanser'),
  pigmentedProduct: run('Aqua, Glycerin, Dimethicone, Titanium Dioxide', 'Decorative foundation'),
  anesthetic: run('Aqua, Frostoin, Prilocaine Hydrochloride, Propylene Glycol, Sodium Hydroxide, CetylPalmitate, C10-16 Alkyl Glucoside, C14-22 Alcohols, Hydroxyethylcellulose, Phenoxyethanal'),
  topicrem: run('AQUA/WATER. PARAFFINUM LIQUIDUM (MINERAL OIL). GLYCERIN. CETEARYL ETHYLHEXANOATE. ISOPROPYL ISOSTEARATE. UREA. CERA ALBA (BEESWAX). PALMITIC ACID. STEARIC ACID. GLYCERYL STEARATE. PEG-100 STEARATE. 1,2-HEXANEDIOL. POLYSORBATE 60. XANTHAN GUM. HYDROXYETHYL ACRYLATE/SODIUM ACRYLOYLDIMETHYL TAURATE COPOLYMER. PARFUM (FRAGRANCE). CAPRYLYL GLYCOL. CHLORPHENESIN. SODIUM HYDROXIDE. SORBITAN ISOSTEARATE.', 'Topicrem'),
};
const retinol = 'Aqua, Glycerin, Squalane, Retinol, Phenoxyethanol';
fixtures.normalProfile = run(retinol, 'Retinol serum', {skinType: 'нормальная', context: 'домашний уход', concerns: ''});
fixtures.pregnancyProfile = run(retinol, 'Retinol serum', {skinType: 'нормальная', context: 'домашний уход', concerns: 'беременность или лактация'});
fixtures.sensitiveProfile = run(retinol, 'Retinol serum', {skinType: 'чувствительная', context: 'после процедуры', concerns: 'розацеа'});
const ocr = {
  inventedReconstruction: cleanInciText('INGREDIENTS: AQUA, CETEARYL CETEARETH RYLIC/CAPRIC TRIGLYCERIDE, CERAMIDE BEHENTRIMA + CERAMIDE EOP, DISODIUM XANTHAN O, PHOSPHATE. WARNING avoid eyes.'),
  frontLabel: cleanInciText('Luxury moisturizing cream, Aqua, Radiant botanical care, Natural daily beauty'),
  unknown: cleanInciText('Qwertyblender, Zxcvbnformula, Plmoknextract'),
  barcodeSameLine: cleanInciText('INGREDIENTS: Aqua, Glycerin, Niacinamide 1234567890123'),
  wrap: cleanInciText('INGREDIENTS: Aqua, PEG-\n40 Hydrogenated\nCastor Oil, Nacinamide, Phenoxyethanal. Directions: apply daily.'),
};
const summarizeProduct = (p) => ({name: `${p.brand || ''} ${p.name}`, id: p.id,
  scope: p.compositionScope, ...run(p.composition, p.name)});
const barcode = {id:'fixture', code:'1234567890123', name:'Test Cream',brand:'Test Brand',category:'Skincare',composition:''};
const evidence = {
  generatedAt: new Date().toISOString(),
  scope: 'Local source audit and deterministic probes. Synthetic fixtures are not manufacturer-verified formulas.',
  data: {
    expert: expert.length, registry: registry.length,
    registryVersion: registryDocument.registryVersion || null,
    registrySource: registryDocument.source || null,
    registryWithFunctions: registry.filter(i => i.functions?.length).length,
    registryWithSource: registry.filter(i => i.provenance?.sourceId).length,
    expertWithCitations: expert.filter(i => i.sources || i.references || i.sourceUrl).length,
    localProducts: products.length, index: read('product-index').length, cache: cache.length,
  },
  fixtures, ocr,
  ranking: {
    exactBarcodeMetadataOnly: rankSourceProducts([barcode], barcode.code),
    unrelatedWithComposition: rankSourceProducts([{...barcode,composition:'Aqua, Glycerin'}], 'Unrelatedproductname'),
  },
  products: [...products, ...cache].filter(p => p.composition).map(summarizeProduct),
};
fs.writeFileSync(new URL('./main-function-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({data:evidence.data, fixtures:Object.fromEntries(Object.entries(fixtures).map(([k,v]) => [k,{count:v.count,expert:v.expert,registry:v.registry,unknown:v.unknown.length,type:v.type,confidence:v.classificationConfidence,score:v.score,quality:v.quality.score,routine:v.routine}])), ocr, ranking:evidence.ranking, products:evidence.products.map(p=>({name:p.name,scope:p.scope,count:p.count,expert:p.expert,registry:p.registry,unknown:p.unknown.length,type:p.type,quality:p.quality.score}))},null,2));
