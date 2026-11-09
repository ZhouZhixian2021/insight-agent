---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-08-product-report-synthesis

English | [中文](2026-11-08-product-report-synthesis.zh.md)

## Summary

Records each product report synthesis request and its bounded response, including failed attempts and complete regeneration.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-report-synthesis
baseline: false
changes:
  - root: "event:product/synthesis-request-v1"
    previous: null
    after: "447f8905f4ba2d1d98bde5471a2a0de9dd5a98465ecb06dceebcf9f4c19ae2b8"
    decision: same-version
  - root: "event:product/synthesis-result-v1"
    previous: null
    after: "55704245f3bd44251214699cd17c5d7dc1ff9a02a5757015fea967fe895f516a"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The reader still accepts existing records and checkpoints. New required event names distinguish synthesis from evidence extraction and comparison. A reader without the new names rejects a log containing them before interpreting or recovering its contents.

<a id="verification"></a>
## Verification

Four Product Insight Loader tests passed. They reopen saved Sessions, check the sequence links for invalid and regenerated responses, and verify final report and cited draft delivery. A build with the previous event catalog refused the new required event on read.

<a id="dev-note"></a>
## Dev Note

None.
