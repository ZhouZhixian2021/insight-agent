---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-29-academic-quote-tiering

English | [中文](2026-10-29-academic-quote-tiering.zh.md)

## Summary

Adds version 2 candidate screening and semantic-review records: a relevance match may omit its passage, and a screening record may declare version 2.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-29-academic-quote-tiering
baseline: false
changes:
  - root: "event:academic/background-run-state"
    previous: "2026-10-27-academic-trace-auto-delivery"
    after: "d7bd460dd1ee6d543d8b185eb6f42c61a6d0dd3aa7313ea934321f31f3a8c5a4"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-verified-v1"
    previous: "2026-10-21-academic-u0-events"
    after: "3a740349fdb1cc27920159cba34bd31b29f890b73ae98a923b60599bf817ea3e"
    decision: same-version
  - root: "event:academic/recovery-checkpoint"
    previous: "2026-10-29-academic-fulltext-admission"
    after: "a0e93f894e67bddefcdfd996f1b7d3213a481ef8f1074597ca3f98ed79a7afcd"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Records written under version 1 keep their meaning and remain readable: every stored signal still carries its passage, and a version 1 review still requires one on every match. New records widen two unions and one discriminant set: the semantic-review record may hold a version 2 judgment, screening details may declare schemaVersion 2, and a stored passage may be absent. Readers in this build accept every combination. An older build reading a version 2 record would treat the missing passage as required; resuming a Session written by this build with an older build is not supported, and no migration rewrites earlier records.

<a id="verification"></a>
## Verification

Focused parser, screening, ranking and controller tests cover both versions, the exclusion downgrade and the updated candidate-review instruction; the prompt snapshot is re-recorded. Persistence catalog and this acknowledgement are generated and checked in the same change.

<a id="dev-note"></a>
## Dev Note

None.
