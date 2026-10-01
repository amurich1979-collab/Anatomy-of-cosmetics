import fs from 'node:fs';
import { openBeautyFactsSource } from '../src/services/productSources/openBeautyFacts.js';
import { upcItemDbSource } from '../src/services/productSources/upcItemDb.js';
import { analyzeComposition } from '../src/analyzer.js';

const probes = [
  {source: openBeautyFactsSource, code:'3401528519895'},
  {source: openBeautyFactsSource, code:'3401572288129'},
  {source: upcItemDbSource, code:'3401572288129'},
];
const results = [];
for (const {source,code} of probes) {
  const start = Date.now();
  try {
    const product = await source.getProduct(code);
    const analysis = product?.composition ? analyzeComposition({text:product.composition,productName:product.name}) : null;
    results.push({source:source.id,code,elapsedMs:Date.now()-start,
      found:!!product,name:product?.name,composition:product?.composition,
      recognized:analysis?.found.length,total:analysis?.totalIngredients,
      expert:analysis?.found.filter(i=>i.dataSource==='expert').length,
      registry:analysis?.found.filter(i=>i.referenceType==='inci_registry').length,
      type:analysis?.productSafety.type,
      note:!product?'Adapter returned null; absence, timeout and network error are not distinguishable here.':undefined});
  } catch (error) {
    results.push({source:source.id,code,elapsedMs:Date.now()-start,error:error.message});
  }
}
fs.writeFileSync(new URL('./live-sources-evidence.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
