---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-30-academic-aspect-coverage

English | [中文](2026-10-30-academic-aspect-coverage.zh.md)

## Summary

Records approved aspect criteria, reviewed question coverage and bounded coverage-repair reservations, plus run-scoped verified additions and exact model inputs/results. Synthesis inputs may carry the final aspect assessment.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-academic-aspect-coverage
baseline: false
changes:
  - root: "event:academic/background-run-q6-update"
    previous: "2026-10-26-academic-background-progress"
    after: "ee433f46b362605809c0356059d1c487607bca976959b97fcc3f6252c5586f3d"
    decision: same-version
  - root: "event:academic/background-run-state"
    previous: "2026-10-30-academic-publication-dates"
    after: "6f200c1b4dbf9a58c8951ba4f2a6699d24b7c560f4e90a0e64f8332f280995c7"
    decision: same-version
  - root: "event:academic/candidate-batch-settlement"
    previous: "2026-10-21-academic-u0-events"
    after: "d2f05b75d3a2b5e4e3b88f1c0b31108df955fd00a9e9f66632ce5349d5327c79"
    decision: same-version
  - root: "event:academic/coverage-repair-paper-v1"
    previous: null
    after: "30cab2a40d1f80ca3c2b1d56dce863c6a2a3c426d4019889fc767a398b79b91b"
    decision: same-version
  - root: "event:academic/coverage-repair-state-v1"
    previous: null
    after: "fb7a084884f06936ca7c1926d17125b2eb4f0f222211630ec12bd7ade9075de4"
    decision: same-version
  - root: "event:academic/coverage-review-request-v1"
    previous: null
    after: "1ea19c61c1e06667af1bd112c86d0eeb65e2ba966ec12ffa2a5a192ebf903b75"
    decision: same-version
  - root: "event:academic/coverage-review-result-v1"
    previous: null
    after: "1942bf12f4f9c081ed442cf6bb966eaafde384f5c8c7a8f58eb4ff9860b9967c"
    decision: same-version
  - root: "event:academic/evidence-fragment-verified"
    previous: "2026-10-21-academic-u0-events"
    after: "0af9028b2a139bbe773ee68c82f8e2a25555f8a0438900a966eefe8006f2ff26"
    decision: same-version
  - root: "event:academic/recovery-checkpoint"
    previous: "2026-10-30-academic-publication-dates"
    after: "0ab32d896a622da98c7e1cfef6dff4fc7f4198f7e13cd0c72b137e08d88d6ffd"
    decision: same-version
  - root: "event:academic/synthesis-request"
    previous: "2026-10-30-academic-publication-dates"
    after: "d19712a60146bc8fdaf023e8366e46c81c3f4b1a1d09411a3d035c69aba37f5b"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Historical briefs and records omit the optional fields and remain readable without acquiring new criteria. New event discriminators are required-on-read: older readers refuse unfamiliar events instead of reconstructing an incomplete run as covered. Current recovery validates frozen criteria and limits, retains consumed reservations and overlays committed source-verified additions. No released generation is rewritten; the Session header remains unchanged because discriminators allow safe refusal.

<a id="verification"></a>
## Verification

307 focused tests passed across coverage budgets, pipeline, recovery, plan validation, retrieval and analysis. A real same-model replay of the original 50 evidence records completed two reviews and two bounded paper repairs, retaining 53 records and remaining gaps for questions 1 and 4.

<a id="dev-note"></a>
## Dev Note

None.
