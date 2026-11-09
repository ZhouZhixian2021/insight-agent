---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-08-product-fragment-overlap

English | [中文](2026-11-08-product-fragment-overlap.zh.md)

## Summary

Records the product investigation window layout in complete recovery checkpoints.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-fragment-overlap
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-fragment-checkpoint"
    after: "03acaf0a1ef2f0c5c69d7fae2e09cad0ecf6e4abb2454488ead8548be6714aaa"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The current reader resumes existing version 1 checkpoints with contiguous windows and version 2 checkpoints only with the fixed 1,499-character overlap. It rejects a missing or mismatched version 2 overlap. The previous reader refuses version 2 checkpoints before model work because it accepts only schemaVersion 1; it cannot silently resume them with different offsets. The event name remains product/checkpoint-v1 and Session format version does not change.

<a id="verification"></a>
## Verification

Product source and workflow tests: 29 passed, including boundary excerpts, duplicate suppression, version 1 continuation, version 2 recovery, and rejection of inconsistent overlap. Product package TypeScript build and targeted lint passed.

<a id="dev-note"></a>
## Dev Note

None.
