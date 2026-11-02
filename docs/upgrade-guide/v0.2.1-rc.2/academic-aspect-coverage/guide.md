---
kind: upgrade-guide
description: New academic plans require approved aspect criteria and new research logs require a reader supporting coverage-review events.
---

# Academic aspect coverage

English | [中文](guide.zh.md)

## Change

New plan documents use schema version 7 and require `coverageRequirements` for every approved question. Versions 1–6 remain readable and retain their original coverage behavior when the optional field is absent. New runs record coverage reviews and repair reservations; older readers reject unfamiliar required events rather than interpreting them as complete research. Existing logs and reports are unchanged.

## Migration

1. Generate and approve new plans with the current academic skill. Keep visible questions concise; include approved aspects and `direct` or `quantitative` requirements in the machine-readable plan. Do not add requirements to an already approved historical plan without review.
2. Upgrade every reader that opens new Session logs. Keep older writers from continuing a new coverage-review run.
3. Review `coverageReviewMaximumCalls`, `coverageReviewMaxTokens`, `coverageReviewAttemptTimeoutMs`, `coverageReviewExcerptCharacters`, `coverageRepairMaximumRounds`, `coverageRepairMaximumPapers`, `coverageRepairMaximumNewWorks` and `coverageRepairMaximumCharacters` in the Controller configuration. Output limits include reasoning tokens; lowering them can leave coverage unreviewed.
4. Confirm the run records aspect gaps and, at its repair bound, reports remaining gaps instead of `target_and_coverage_met`. See [workflow](../../../../packages/academic/workflow/README.md).
