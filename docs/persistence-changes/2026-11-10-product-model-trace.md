---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-10-product-model-trace

English | [中文](2026-11-10-product-model-trace.zh.md)

## Summary

Adds an optional request trace ID to the five saved product model request events so each request can be matched with content-free transport diagnostics.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-product-model-trace
baseline: false
changes:
  - root: "event:product/claim-review-request-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "1b4178b82e387ab0e9d8b2fb19194979d6afbf230f7ab614cce23cb9ae37452a"
    decision: same-version
  - root: "event:product/cross-check-request-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "bc7a49642097e5741c45daf06e7e9dadeb98da20532c9f0eefc3ac2a3470dd12"
    decision: same-version
  - root: "event:product/model-request-v1"
    previous: "2026-11-10-product-trace-plan-identity"
    after: "94e30b84cc66bcaf802d3aa8f87356b015b37ad8e66e1421c273ac4dfe9bbff1"
    decision: same-version
  - root: "event:product/passage-model-request-v1"
    previous: "2026-11-10-product-passage-plan-identity"
    after: "799d94be90467dbda8296b2ea34380caa9e503e4b13157f061c9ef755dd61d48"
    decision: same-version
  - root: "event:product/synthesis-request-v1"
    previous: "2026-11-08-product-synthesis-transient-retry"
    after: "c40c93ecd5c5647bc162f7c1d5bd9bb870e4cc52f28118386cb05cbbe288b11a"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The trace ID is optional in each event. Historical Session records without it remain readable and retain their existing replay identity. No result event or required field changes.

<a id="verification"></a>
## Verification

The persistence-change gate checks the generated schema. Product workflow and transcript unit tests cover new trace IDs and historical requests without them; the transport adapter unit test checks header propagation and diagnostic metadata.

<a id="dev-note"></a>
## Dev Note

None.
