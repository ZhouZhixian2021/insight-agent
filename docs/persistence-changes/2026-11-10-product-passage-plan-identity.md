---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-10-product-passage-plan-identity

English | [中文](2026-11-10-product-passage-plan-identity.zh.md)

## Summary

Adds optional approved-plan identity to saved page text and passage-selection model events so the transcript Trace can associate new records with their investigation.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-product-passage-plan-identity
baseline: false
changes:
  - root: "event:product/passage-model-request-v1"
    previous: "2026-11-10-product-passage-evidence"
    after: "92bf64320b04c6b45970e8224a7b677814be043e6ca1acfcab94df1ae3f43187"
    decision: same-version
  - root: "event:product/passage-model-result-v1"
    previous: "2026-11-10-product-passage-evidence"
    after: "600c6144ce369beaa29b3691824862a786919a1a95a7c494da99332a74b01e1f"
    decision: same-version
  - root: "event:product/source-text-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "c2df876a58b87fbc381bfa9d19e8386fe12ae9fb5b4aef8e3c3e17e7ae484815"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The fields are optional because earlier records omit them. Saved-source and passage replay still accept those records by candidate-page identity, while the Trace projects only events with an explicit approved-plan identity. The event names and required fields remain unchanged, so old Session files remain readable.

<a id="verification"></a>
## Verification

`pnpm run verify-persistence-changes` checks the generated schema and acknowledges these optional fields. The product-insight unit suite covers saved evidence, resumed checkpoints, and the transcript projection; no smoke test is required for this record.

<a id="dev-note"></a>
## Dev Note

None.
