# C04 OCR Evaluation

- Acceptance status: **partial**
- Independent readable gold photos: 0
- Official precision: not evaluated
- Official recall: not evaluated
- Official auto-acceptance: not evaluated

## Provisional difficult-photo diagnostic

> This section uses external catalog transcription, not independently approved gold.

- Same four cases as baseline: yes
- Baseline precision / recall: 37.59% / 46.30%
- Enhanced precision / recall: 39.85% / 49.07%
- Automatically accepted difficult INCI photos: 0/3
- Rejected for clarification: 3/3
- Front labels identified: 0/1

## Acceptance blockers

- No independent readable photo gold exists in C02 yet.
- The provisional difficult-photo diagnostic remains below the target and correctly fails closed.
- Android and iOS physical-device checks are still required.
- PaddleOCR and EasyOCR are candidates, not measured results.

See `docs/C04_OCR_ENGINE_COMPARISON.md` for the reproducible next-engine protocol.
