---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-02-academic-scope-decision

English | [中文](2026-11-02-academic-scope-decision.zh.md)

## Summary

Adds an optional reviewed scope decision to the Brief carried by academic synthesis requests.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-02-academic-scope-decision
baseline: false
changes:
  - root: "event:academic/synthesis-request"
    previous: "2026-10-30-academic-aspect-coverage"
    after: "076f610dd4a94e1fb4ea1996c58168065efe7c4150b0a64c7784e582ea656a0d"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing synthesis-request events omit the field and retain their previous meaning. New readers treat absence as an undisclosed historical scope decision and do not infer omitted directions. The added field is optional; older readers can keep using the request's approved questions and evidence without interpreting the extra direction disclosure. It does not alter synthesis request identity or the accepted evidence records.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/academic/research-controller/tests/plan-validation.spec.ts packages/academic/report/tests/directions.spec.ts: 79 tests passed. pnpm run build passed.

<a id="dev-note"></a>
## Dev Note

None.
