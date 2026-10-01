import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditLegacyExpertEntries,
  buildCoverageReport,
  buildPriorityBatch,
  collectFormulaCorpus,
  rankCorpusIngredients
} from "../src/services/expertCoverage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const write = (relativePath, value) => fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const checkedAt = "2026-09-29";

const corpus = collectFormulaCorpus({
  products: read("data/products.json"),
  productDetailsCache: read("data/product-details-cache.json")
});
const ranking = rankCorpusIngredients(corpus);
const knowledge = read("data/expert-claims.json");
const legacyAudit = auditLegacyExpertEntries(read("data/ingredients-expert.json"));
const priorityBatch = buildPriorityBatch(ranking, knowledge, { checkedAt, limit: 25 });
const report = buildCoverageReport({ corpus, ranking, priorityBatch, knowledge, legacyAudit, checkedAt });

write("data/expert-coverage-priority.json", {
  schemaVersion: report.schemaVersion,
  version: report.version,
  checkedAt,
  corpusFormulaCount: report.corpus.eligibleRealFullFormulas,
  methodology: report.priorityMethod,
  limitation: report.corpus.limitation,
  entries: priorityBatch
});
write("audit/t12-expert-coverage.json", report);

console.log(JSON.stringify({
  corpus: report.corpus,
  coverage: report.coverage,
  priorityEntries: priorityBatch.length,
  legacySummary: legacyAudit.summary
}, null, 2));
