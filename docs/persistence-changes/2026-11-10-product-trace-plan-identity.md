---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-10-product-trace-plan-identity

English | [中文](2026-11-10-product-trace-plan-identity.zh.md)

## Summary

Add optional plan identity to product extraction request/result and synthesis result events for per-run Trace projection.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-product-trace-plan-identity
baseline: false
changes:
  - root: "event:product/model-request-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "bcf869589e89ec446564e88c2b765421feb69806b45ec150fda2ac4b1e6895b0"
    decision: same-version
  - root: "event:product/model-result-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "6ebd95ad6dad8e98b2d5cbf4d0ac1dbb3d91d0489e726cbf0172b48ce3478897"
    decision: same-version
  - root: "event:product/synthesis-result-v1"
    previous: "2026-11-08-product-synthesis-transient-retry"
    after: "0c65255ee490475f77062dcc6b36e8e890f45b0a4451f72ddacb49fbe93eb7ef"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing records without planId remain readable. Writers add the identity from the approved plan or candidate; the UI does not infer plan identity for old unlinked events. No event names or required fields change, and existing explicit plan limits and saved source offsets remain enforceable.

<a id="verification"></a>
## Verification

Product workflow, source preparation/discovery, writing and chat targeted tests: 73 passed; no live-model calls.

<a id="dev-note"></a>
## Dev Note

None.
