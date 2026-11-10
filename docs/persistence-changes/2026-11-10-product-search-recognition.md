---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-10-product-search-recognition

English | [中文](2026-11-10-product-search-recognition.zh.md)

## Summary

Adds product search recognition request and result audit events.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-product-search-recognition
baseline: false
changes:
  - root: "event:product/search-recognition-request-v1"
    previous: null
    after: "176465659bce9f931c8f9d7d18bbff7f004287807aacd522e7caf78ecdba7f35"
    decision: same-version
  - root: "event:product/search-recognition-result-v1"
    previous: null
    after: "b8d490dd3907278680fe8d068ff81cf228e64257f259c6b39f946432ecd6f733"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing event shapes are unchanged. New events retain exact model inputs and outputs for audit; old sessions without them remain valid and absence never implies recognition success. Recovery uses normal discovery checkpoints, not these audit events.

<a id="verification"></a>
## Verification

Focused search recovery and workflow tests passed; shipped composition browser verification is recorded in the development note.

<a id="dev-note"></a>
## Dev Note

None.
