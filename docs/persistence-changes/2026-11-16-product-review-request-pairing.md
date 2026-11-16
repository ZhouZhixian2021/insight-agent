---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-16-product-review-request-pairing

English | [中文](2026-11-16-product-review-request-pairing.zh.md)

## Summary

Associate concurrent product source-review results with their exact request sequence.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-16-product-review-request-pairing
baseline: false
changes:
  - root: "event:product/claim-review-result-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "45fb4bcb0f6900d00c6da947c126aef777bb2d6fb00da465514bb4f3388f4825"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Adds optional requestSeq to product/claim-review-result-v1. Historical records without it remain readable; the new source-only prompt prevents reusing old question-dependent responses. New replay requires the exact sequence association and never guesses concurrent completion order. Older structural readers ignore the optional field but older runners do not support resuming out-of-order claim checkpoints; resume such runs with the updated workflow. Review questionIds remain structurally present and may be empty; extraction IDs are retained as discovery hints.

<a id="verification"></a>
## Verification

60 focused workflow, writing and client tests passed, including empty review question IDs, 24-item/3-worker dispatch, out-of-order checkpoint recovery and Trace pairing. Full build passed all 9 gates.

<a id="dev-note"></a>
## Dev Note

None.
