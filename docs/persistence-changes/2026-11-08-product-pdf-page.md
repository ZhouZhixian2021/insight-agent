---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-08-product-pdf-page

English | [中文](2026-11-08-product-pdf-page.zh.md)

## Summary

Records physical PDF page numbers on product evidence text ranges.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-pdf-page
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-corroboration-gap"
    after: "c4da7c56525e44765a28cd8fd03112b37eb8b999afa5884a36d38761754154a3"
    decision: same-version
  - root: "event:product/evidence-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "797feb241fff6f45b0905dc6b99439a03c70b2017351942d3bf16a0a25e876fe"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The optional pdfPage field extends text-range locations while preserving the exact start and end offsets and canonical text hash. Existing HTML and text evidence has no page number and remains readable. Older readers can verify the offsets in saved text. They may reject a partial revalidation checkpoint containing retained reviews outside the previously supported corroboration path.

<a id="verification"></a>
## Verification

Product source and workflow tests verify physical PDF page numbering, rejection of cross-page excerpts, and retention of evidence and reviews for unchanged sources.

<a id="dev-note"></a>
## Dev Note

None.
