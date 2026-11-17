---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-17-product-synthesis-validation

English | [中文](2026-11-17-product-synthesis-validation.zh.md)

## Summary

Adds optional per-question synthesis validation diagnostics to product/synthesis-result-v1.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-17-product-synthesis-validation
baseline: false
changes:
  - root: "event:product/synthesis-result-v1"
    previous: "2026-11-10-product-trace-plan-identity"
    after: "d92378b6c87400247b6e674bfe00d3d6cffbbe2474e2f702bc4f28d15cebfa6c"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing results without validation remain readable; replay re-inspects saved output with the matching request material. New diagnostics only describe accepted question IDs, validation issues and normalization notes. Existing readers ignore this additional field and continue to use raw text, error and requestSeq; absence never implies validation success. No Session header or existing required field changes.

<a id="verification"></a>
## Verification

76 focused workflow and product chat tests passed, including partial-output preservation, per-question repair, transport retry, cancellation, rendering and historical Trace events without diagnostics.

<a id="dev-note"></a>
## Dev Note

None.
