---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-20-product-image-readings

English | [中文](2026-11-20-product-image-readings.zh.md)

## Summary

Product page checkpoints can list images with their captions and surrounding text. Each image reading records its source, model and either a result or an acquisition error.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-20-product-image-readings
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-18-product-evidence-reading-context"
    after: "60433b9e635edc2b4ea867e4baaa04f8884c913d7b1f19d9702ad16e9e16c9e1"
    decision: same-version
  - root: "event:product/image-reading-v1"
    previous: null
    after: "963a0b8e5f9b87f1eace891fd46a8a674d372d0cd305c0607e8f53355d187c93"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Current readers accept older checkpoints with no image list and continue the text workflow. The new event has its own type. Earlier readers that do not recognize it refuse the session before replay. The existing page snapshots and text evidence keep their meaning.

<a id="verification"></a>
## Verification

The three visual-material tests passed, covering reuse across matching images, resumption with saved readings, individual failures and cancellation. The page-content tests passed for saved text and figure context.

<a id="dev-note"></a>
## Dev Note

None.
