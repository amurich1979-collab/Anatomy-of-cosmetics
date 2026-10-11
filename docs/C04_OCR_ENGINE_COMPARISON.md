# C04 OCR Engine Comparison

## Scope

C04 keeps photo processing local in the browser. It does not enable paid OCR or transmit a user photo to a new provider. The measured comparison uses the same four difficult files recorded in `audit/c04/case-ids.json`.

The reference ingredient strings in that diagnostic came from an external catalog. They are not independent manual gold and therefore cannot prove acceptance accuracy. Official acceptance remains blocked until C02 has independently transcribed readable photos.

## Measured paths

| Path | Same cases | Precision | Recall | Status |
| --- | ---: | ---: | ---: | --- |
| Existing Tesseract.js full-frame path | 4 | 37.59% | 46.30% | provisional, not gold |
| Tesseract.js with C04 contrast, text crop and rotation selection | 4 | 39.85% | 49.07% | provisional, not gold |

The enhanced path improved this tiny difficult set by 2.26 percentage points precision and 2.77 points recall, but is far below the C04 target. All three difficult INCI photos were rejected for clarification rather than silently accepted. This is the correct safety behavior, not sufficient product utility.

## Available alternatives

| Engine | Relevant capability | Repository status | Decision |
| --- | --- | --- | --- |
| Tesseract.js | Runs in browsers through JavaScript/WebAssembly; current local path | Measured | Keep as privacy-preserving baseline |
| PaddleOCR PP-OCRv5 multilingual | Includes multilingual recognition models, including Russian and common European languages | Not installed or benchmarked | Next candidate |
| EasyOCR | Supports Latin and Cyrillic scripts and can run locally | Not installed or benchmarked | Secondary candidate |

Sources: [Tesseract.js repository](https://github.com/naptha/tesseract.js), [PaddleOCR multilingual documentation](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html), [EasyOCR repository](https://github.com/JaidedAI/EasyOCR).

No accuracy number is assigned to an unrun alternative. Installation alone is not evidence that it is better on curved, glossy cosmetic labels.

## Reproducible next benchmark

1. Complete independent C02 transcription for at least 100 photos and freeze the product-level final split.
2. Run each engine on identical original files with identical language information and no catalog text exposed to the engine.
3. Store raw text, elapsed time, preprocessing, rejected/accepted state and unresolved positions per photo.
4. Measure ingredient precision and recall only on readable human-gold photos. Publish auto-accepted share and rejection count separately.
5. Publish a separate slice for glare, curvature, blur, low contrast, rotation, mixed scripts and dense labels.
6. Require zero silently deleted unknown medical ingredients.
7. Select an engine only after the final split meets precision >=99%, recall >=95% among automatically accepted readable photos and >=80% auto-acceptance.

Recommended next experiment: run PP-OCRv5 multilingual in a local isolated process first. A remote service may be considered only after explicit consent, retention terms and cost are agreed; it is not enabled by C04.

## Commands

```powershell
npm.cmd run measure:c04
npm.cmd run test:c04
```

To reproduce the current difficult-photo browser diagnostic:

```powershell
python audit/t18-ocr-live.py --partition final --case-ids audit/c04/case-ids.json --output audit/c04/enhanced-ocr.json
```

The live command needs network access for the licensed test images and the locally served application. It must not be substituted for the future human-gold evaluation.
