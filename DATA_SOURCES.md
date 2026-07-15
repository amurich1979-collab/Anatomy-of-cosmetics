# Data Sources

## Product Sources

The project should not keep a local copy of a huge global product catalog. It now uses independent product-source adapters in `src/services/productSources/` and caches only products actually requested by users.

### Open Beauty Facts

- Adapter: `src/services/productSources/openBeautyFacts.js`
- API: `https://world.openbeautyfacts.org/api/v2/product/{barcode}.json` and `https://world.openbeautyfacts.org/cgi/search.pl`
- API key: not required for public read endpoints.
- Data used: barcode, product name, brand, category, product image, INCI/ingredients text, product URL.
- Quality: best open source for cosmetic products, but data is crowdsourced and must be checked against the package.
- Limitation: not all professional/cosmetology products are present; ingredients may differ by market or product version.

### Official GIGI catalogue

- Adapter: `src/services/productSources/gigiOfficial.js`
- Source: `https://www.gigi.ru/search/?q={product}` and official product cards.
- API key: not required. The integration reads only public catalogue pages and runs only for GIGI or recognised GIGI product-line queries.
- Data used: product name, brand, internal SKU, photo, description, intended use, use instructions and manufacturer-declared active ingredients.
- Quality: first-party source for identity and intended use. It is therefore preferred over crowdsourced catalogues for recognising GIGI products.
- Limitation: many official cards publish active ingredients rather than a complete INCI list. The adapter never labels those active ingredients as a full formula and asks for the label INCI before formula analysis.

### External product-card discovery

- Adapter: `src/services/productSources/externalCatalogDiscovery.js`
- Source: a public web-search index, followed by product pages that expose `schema.org/Product` structured data.
- API key: not required.
- Data used: product name, brand, SKU/GTIN when published, photo, description and an INCI string only when the page explicitly publishes one.
- Quality: a broad fallback for brands missing from Open Beauty Facts and without their own adapter. Every result keeps its domain and is marked as requiring label verification.
- Limitation: this is discovery, not an authoritative database. Pages without structured product data are ignored; INCI is never inferred from a description or ingredient marketing claims.

### INCI Decoder

- Adapter: `src/services/productSources/inciDecoder.js`
- Source: `https://incidecoder.com/products/`, discovered by exact user query. Its published `robots.txt` permits public crawling of product pages.
- API key: not required.
- Data used: product title and the INCI list explicitly published in a product-card description.
- Quality: useful additional coverage for international consumer cosmetics missing from Open Beauty Facts.
- Limitation: third-party data only. The service marks every formula as unverified and never merges it with a different formula from another source.

### UPCitemdb

- Adapter: `src/services/productSources/upcItemDb.js`
- API: `https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}` and trial search endpoint.
- API key: not required for the public trial endpoint, but production use can require a paid/API-key plan.
- Data used: barcode, product title, brand, category/description, image URL if present.
- Quality: useful for barcode identification and images; usually does not provide cosmetic INCI.
- Limitation: trial endpoints have usage limits and are not a final production data contract.

### Open Products Facts

- Adapter: `src/services/productSources/openProductsFacts.js`
- API: `https://world.openproductsfacts.org/api/v2/product/{barcode}.json` and `https://world.openproductsfacts.org/cgi/search.pl`
- API key: not required for public read endpoints.
- Data used: barcode, product name, brand, category, image, ingredients text if present.
- Quality: broad open product database, not specifically cosmetic.
- Limitation: use as a fallback only; cosmetic INCI coverage is less reliable than Open Beauty Facts.

## Product Merge Strategy

Search order is:

1. Barcode/EAN/UPC.
2. Product name.
3. Brand/name text from OCR.
4. OCR ingredient text as the last fallback.

For a text search the service does not stop after the local cache or Open Beauty Facts returns a match. It combines relevant cards from all configured sources, ranks them by the query, keeps formulas from different sources separate, and then uses the web fallback only if the source results do not fill the list. This allows official brand catalogues to cover products that are absent from Open Beauty Facts.

If the same product is found in multiple sources, the system merges product identity fields but does not mix formulas. Different INCI strings are stored in `formulaVariants` with source, source URL and fetch date. A product receives `hasFormulaConflict: true` and `formulaConflictNote` when sources disagree.

## Local Product Cache

- Cache file: `data/product-details-cache.json`
- Purpose: keep only products that users really searched or opened.
- Stored fields: name, brand, barcode, images, INCI, source, source URL, fetch date, formula variants.
- Not intended as a full catalog dump.

## Ingredient Sources

### CosIng / INCI Registry

- Local registry: `data/inci-registry.json`
- Import script: `scripts/import-cosing-inci-registry.js`
- Data used: canonical INCI name, aliases, functions, CAS, source metadata.
- Strategy: use official export/import where possible. Do not scrape pages if source rules do not allow it.

### Expert Ingredient Knowledge

- File: `data/ingredients-expert.json`
- Data used: category, roles, benefits, risks, best_for, avoid_for, quality_score, evidence_level.
- Purpose: expert evaluation of formulas after ingredient normalization.

### Localized INCI Translations

- File: `data/inci-translations.json`
- Supported language groups: English, Portuguese, Spanish, French, German, Italian.
- Purpose: convert common localized ingredient names to canonical INCI before analysis.

## How To Extend

To add a new product source, create a new adapter in `src/services/productSources/` with:

- `searchByBarcode(barcode)`
- `searchByName(query, options)`
- `getProduct(idOrBarcode)`

Then add it to `productSources` in `src/services/productSources/index.js`.

To extend ingredient normalization, update:

- `data/inci-registry.json` for canonical names and aliases.
- `data/inci-translations.json` for localized names.
- `data/ingredients-expert.json` for expert rules.
