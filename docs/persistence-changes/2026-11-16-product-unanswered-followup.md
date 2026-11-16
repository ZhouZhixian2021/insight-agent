---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-16-product-unanswered-followup

English | [中文](2026-11-16-product-unanswered-followup.zh.md)

## Summary

Records unanswered product questions on a settled investigation for optional follow-up planning.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-16-product-unanswered-followup
baseline: false
changes:
  - root: "event:product/run-settlement-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "2befc74bb11f85062aea038c98a163849e829a752dbeb7b06408f6fc1ed2ce7d"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The field is optional. Existing settlements remain readable and show their saved reports without follow-up controls. New readers validate the optional list before displaying it; older readers ignore the additional field.

<a id="verification"></a>
## Verification

Focused product workflow and transcript tests passed; the new list is projected from the settled run without changing the approved plan or report.

<a id="dev-note"></a>
## Dev Note

None.
