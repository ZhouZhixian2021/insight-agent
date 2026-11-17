---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-17-product-extraction-inspection

English | [中文](2026-11-17-product-extraction-inspection.zh.md)

## Summary

Adds product extraction inspection records for per-item validation, targeted repair, and exact-text reuse.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-17-product-extraction-inspection
baseline: false
changes:
  - root: "event:product/extraction-inspection-v1"
    previous: null
    after: "a19e7b023b77a837b055c4da9f94a2c143b724c644750e31c38f41236b7c489c"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The new event is additive and carries diagnostics only. Existing request/result and evidence event generations are unchanged. Historical sessions without inspection records remain readable; absence does not assert that item validation or reuse occurred. Readers that ignore this event retain the existing evidence and report semantics.

<a id="verification"></a>
## Verification

59 focused workflow tests passed, including short-ID restoration, retention of valid siblings after repair failure, and exact-text reuse. Workflow and bundle project type checks passed.

<a id="dev-note"></a>
## Dev Note

None.
