# T18 human review guide

The corpus manifest contains licensed candidate records, not automatically approved gold labels.

For each record, a reviewer must open `source.productUrl` and the exact revision in `inputs.ingredientImage.url`, then complete `reference.humanReview`:

1. Set `status` to `approved` only when the ingredient image is readable and belongs to the same barcode/product.
2. Transcribe every ingredient in order into `exactIngredients`. Do not copy analyzer output.
3. Set `labelType` to `ingredients`, `front`, `active_only`, `mixed`, or `non_cosmetic`.
4. Set `readability` to `readable`, `borderline`, or `unreadable`.
5. Record visible conditions in `visualConditions`: `small_print`, `glare`, `curved_packaging`, `perspective`, `blur`, or `none`.
6. Record the product class only when the packaging/source explicitly supports it.
7. Add reviewer name/identifier and ISO timestamp. Use `rejected` with a reason for mismatched or uncertain records.

Setup and final partitions are brand-disjoint. Reviewers may expose setup labels during development. Final labels must stay untouched until the implementation is frozen.

Metrics scripts must exclude every record whose human review status is not `approved`. Open Beauty Facts `ingredients_text` is retained as a provisional external transcription for diagnostics, not promoted to human-verified project ground truth.
