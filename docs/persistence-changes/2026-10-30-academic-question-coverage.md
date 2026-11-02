---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-30-academic-question-coverage

English | [中文](2026-10-30-academic-question-coverage.zh.md)

## Summary

Adds exact question-coverage model request and attempt records before ranked batch settlement.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-academic-question-coverage
baseline: false
changes:
  - root: "event:academic/coverage-request-v1"
    previous: null
    after: "e47297e49c1814f5b471d81d4039b9fc3df9b0218808ea051455ad17e43fc97e"
    decision: same-version
  - root: "event:academic/coverage-result-v1"
    previous: null
    after: "0f561cf29591915cdcc969c6ce07673cddc3a55e8dd53eeddef76680e251b4aa"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing event payloads and historical Session generations are unchanged. New readers accept old runs without coverage records and assess retained evidence when resuming. New discriminators identify required-on-read coverage records; older readers that do not know them reject the run rather than treating unassessed question links as complete answers. No migration, fallback or downgrade support is introduced.

<a id="verification"></a>
## Verification

Reviewed request durability, parser reference validation and conservative failure handling in source. Automated tests were not run at the user's request.

<a id="dev-note"></a>
## Dev Note

None.
