# Report

## Changed Files

- `src/services/productSources/` - added independent product-source adapters and a merge layer.
- `src/products.js` - connected external product search through the new source layer and cached only requested external products.
- `src/services/inciCleaner.js` - added localized ingredient translation before canonical INCI matching.
- `data/inci-translations.json` - added initial multilingual ingredient aliases for English, Portuguese, Spanish, French, German and Italian.
- `tests/inci-cleaner.test.js` - added tests for localized INCI normalization.
- `tests/product-sources.test.js` - added tests for the common source interface and conflicting formulas.
- `package.json` - extended syntax checks to include the new service modules.
- `DATA_SOURCES.md` - documented connected APIs, limits, data usage and extension rules.
- `REPORT.md` - this report.

## Connected Sources

- Open Beauty Facts: main open cosmetic product source for barcode/name search, images and ingredients.
- UPCitemdb: barcode identification fallback; useful for product names and images, usually without INCI.
- Open Products Facts: open general product fallback, not cosmetic-specific.
- CosIng local registry: canonical INCI names, aliases, functions and CAS from imported registry data.
- Local expert ingredient base: expert scoring and interpretation after normalization.

## Added Rules

- Product source adapters share one interface: `searchByBarcode()`, `searchByName()`, `getProduct()`.
- Barcode-like queries search external sources by barcode.
- Name queries search external sources only after local search has no result.
- External products are cached only when actually requested or returned to the user.
- If multiple sources return different formulas for the same barcode/product, formulas are stored as separate `formulaVariants`.
- Different formulas are not mixed automatically; the product receives `hasFormulaConflict` and a user-facing note.
- Localized ingredient names are converted to canonical INCI before expert analysis.

## Remaining Limitations

- UPCitemdb trial API is not a production-grade contract and may require an API key or paid limits later.
- Open Products Facts is a broad fallback source and may not improve cosmetic coverage much.
- Formula conflicts are exposed in data, but the current UI may need a later dedicated visual block to show all variants clearly.
- Localized INCI translations are a starting dictionary, not a complete multilingual ingredient taxonomy.
- Product data remains only as reliable as the external source and should still be verified against the package for professional recommendations.
