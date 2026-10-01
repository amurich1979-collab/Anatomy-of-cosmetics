# T18 real-data corpus

This directory contains the reproducible artifacts for T18. It is an audit
corpus, not a product catalogue and not a claim of market-wide accuracy.

## Provenance

- Candidate records are fetched from the Open Beauty Facts API by
  `scripts/build-t18-corpus.mjs` with an identifying User-Agent.
- Open Beauty Facts database records are offered under ODbL. Product images
  are offered under CC BY-SA. Attribution and share-alike obligations remain
  applicable. The exact source product page and image URL are retained per
  record in `corpus-manifest.json`.
- Relevant source documentation:
  - https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/scanning-cosmetics-pet-food-and-other-products/
  - https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/
  - https://openfoodfacts.github.io/openfoodfacts-server/api/how-to-download-images/

## Status and split

`corpus-manifest.json` currently contains 120 candidate records: 80 setup and
40 final. The split is deterministic and brand-disjoint. A final brand is not
allowed in setup.

All `humanReview.status` values are currently `pending`. Open Beauty Facts
`ingredients_text` is an external transcription and is not independent gold.
Consequently, `evaluation.json` and both browser OCR files are diagnostics,
not a validated accuracy benchmark.

Human reviewers must follow `REVIEW_GUIDE.md`. Records become gold only after
the reviewer has compared the exact source image, entered the label
transcription independently, classified readability/visual conditions and set
the individual review status to `approved`.

## Reproduction

```powershell
node scripts/build-t18-corpus.mjs
node scripts/run-t18-evaluation.mjs
python audit/t18-ocr-live.py --partition setup
python audit/t18-ocr-live.py --partition final
npm.cmd run test:t18
```

The browser run uses real downloaded files and the production path
`file -> Tesseract.js -> /api/photo/resolve -> cleaner -> /api/analyze`.
The barcode diagnostic uses live product sources and then the production
analyzer. Accuracy data is not mocked.

## Artifacts

- `corpus-manifest.json`: source manifest, split and pending review records.
- `evaluation.json`: text-cleaning, registry/expert coverage, safety and live
  barcode diagnostics.
- `ocr-live.json`: setup browser OCR run.
- `ocr-live-final.json`: final browser OCR run, run only after setup.
- `safety-cases.json`: medical, active-only and front-label refusal cases.

The manifest includes more than 100 records, but it does not yet prove that
the requested mix of glare, curved packaging and small print is present. Those
attributes cannot be inferred reliably from API metadata and remain part of
the pending visual review.
