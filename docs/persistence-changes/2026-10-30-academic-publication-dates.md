---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-30-academic-publication-dates

English | [中文](2026-10-30-academic-publication-dates.zh.md)

## Summary

Adds explicit academic publication-date policies, frozen run contexts, paper date verdicts and approved content-rule references, plus a versioned date-context Session event.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-academic-publication-dates
baseline: false
changes:
  - root: "event:academic/background-run-state"
    previous: "2026-10-29-academic-quote-tiering"
    after: "150be891954a070ad8485f8e48d38b16b4f37e01d78013f3feafc1e0312a4b70"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-verified-v1"
    previous: "2026-10-29-academic-quote-tiering"
    after: "819b0441c374444a543de8c6063a96acdd559d558e9e8636a459a9399a92de80"
    decision: same-version
  - root: "event:academic/publication-date-context-v1"
    previous: null
    after: "91a7ad3abf95088bc53d4453d0c6188f5d7c4499488fb023e037e85a70354c7c"
    decision: same-version
  - root: "event:academic/recovery-checkpoint"
    previous: "2026-10-29-academic-quote-tiering"
    after: "7874d50692bdd3bf00b0c3bb34818942312e80d6b821fdb4fee198ccbd2f9c0c"
    decision: same-version
  - root: "event:academic/synthesis-request"
    previous: "2026-10-29-academic-scope-screening"
    after: "6f33ffcda37efdc9215f73290ea81a115bfa5851f3b0f63a7e98eb4a76564eae"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing fields retain their meanings and new fields on existing records are optional. Historical plans and Session generations are not rewritten. New plan version 6 requires an explicit policy; legacy null upper bounds with unclassified date rules require renewed approval before execution. Existing valid fixed bounds remain supported. New writers emit academic/publication-date-context-v1 before explicit-policy work; older readers safely refuse this unknown required event. New readers accept old records without these optional fields and never invent a cutoff for an ambiguous legacy plan. Recovery reuses saved calendar dates instead of the recovery clock. Same-version interpretation or safe refusal is preserved in both reader directions.

<a id="verification"></a>
## Verification

664 tests passed across academic workflow, retrieval and research-controller suites. The keyless academic-publication-date SDK Loader snapshot passed with both evidence model routes, rejecting the invented May 7 cutoff for the September 1 paper. Regression tests cover date boundaries, source precision, unknown dates, date basis, Shanghai/UTC midnight, next-day recovery, policy validation and content exclusion.

<a id="dev-note"></a>
## Dev Note

None.
