# T18. Decision gate for OCR alternatives

## Why an alternative is being considered

The measured Tesseract.js baseline is below the preliminary target. On the
brand-disjoint final diagnostic (3 real ingredient-label images, external
source transcription rather than human gold), automatically extracted tokens
had precision 76.27% and recall 53.57%. One full-resolution image did not
finish within 180 seconds. This is enough to justify an experiment, but not
enough to select or activate a replacement.

## Options to benchmark

| Option | Expected deployment | Accuracy evidence needed | Latency measurement | Cost | Privacy and processing terms |
| --- | --- | --- | --- | --- | --- |
| Tesseract.js (baseline) | Existing browser, local | Human-approved T18 labels | p50/p95 on 360/390/412 px real phones and desktop | No per-call fee | Photo stays in the browser for OCR; the resulting text continues through the application |
| PaddleOCR | Self-hosted or local runtime | Same frozen human-approved final set; no vendor benchmark may replace it | Cold start, p50/p95 and memory on intended CPU/GPU | Infrastructure and maintenance only; must be measured | Can be self-hosted; deployment/license review is required before inclusion |
| Google Cloud Vision OCR | External paid API | Same frozen final set, with identical cleaner thresholds | End-to-end p50/p95 including upload | Verify current per-image pricing and quotas before a trial | Images leave the application host; configure region/retention and review the Cloud Data Processing Addendum |
| Azure Vision Read/OCR | External paid API | Same frozen final set, with identical cleaner thresholds | End-to-end p50/p95 including upload | Verify current transaction pricing and quotas before a trial | Images leave the application host; retention, region, consent and DPA require review |

Official references used for this decision gate:

- PaddleOCR documentation: https://www.paddleocr.ai/main/en/index/index.html
- Google Cloud Vision OCR: https://docs.cloud.google.com/vision/docs/ocr
- Google Cloud Vision data usage: https://docs.cloud.google.com/vision/docs/data-usage
- Google Cloud Vision pricing: https://cloud.google.com/vision/pricing
- Azure responsible OCR guidance: https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/computer-vision/ocr-guidance-integration-responsible-use
- Azure Vision pricing: https://azure.microsoft.com/en-us/pricing/details/computer-vision/

## Required experiment

1. Finish independent human review and freeze the brand-disjoint final set.
2. Run every engine on the exact same original files. Do not tune on final.
3. Report automatically accepted ingredient precision and recall with 95%
   intervals, refusal rate, p50/p95 latency, failures and cost per 1,000 images.
4. Separately score small print, glare, curved labels, multilingual labels,
   front labels and non-cosmetic/active-only safety cases.
5. Reject an engine that invents hidden ingredients, silently substitutes a
   different formula or turns an incomplete label into a global score, even if
   its aggregate OCR metric is higher.
6. For a cloud engine, obtain an explicit user/product decision on consent,
   data region, retention, provider terms and budget before any production key
   or photo is sent.

## T18 decision

No alternative was activated. There is no human-approved gold set yet, so a
fair accuracy comparison cannot be made. PaddleOCR is the first local
candidate for the next controlled experiment; cloud OCR remains an explicit
product/privacy decision rather than an automatic technical fallback.
