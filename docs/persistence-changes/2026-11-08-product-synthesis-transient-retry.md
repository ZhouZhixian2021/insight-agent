---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-08-product-synthesis-transient-retry

English | [中文](2026-11-08-product-synthesis-transient-retry.zh.md)

## Summary

Adds an optional attempt number and classified failure code to product report synthesis records.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-synthesis-transient-retry
baseline: false
changes:
  - root: "event:product/synthesis-request-v1"
    previous: "2026-11-08-product-report-synthesis"
    after: "04f3a8e8970b9e26b4f65e9f4c8837abf501118e838d10a0178016b2171884d0"
    decision: same-version
  - root: "event:product/synthesis-result-v1"
    previous: "2026-11-08-product-report-synthesis"
    after: "e20c3c49dbdff4556fe3715039210c787844662a0218f7011a29d14b5f02960d"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing synthesis records omit the new fields. The runner still matches legacy requests by exact input and retains their recovery behavior. The Session reader accepts and preserves the extra payload fields on the existing events. Older runners can still read the request and result and apply their existing recovery rules.

<a id="verification"></a>
## Verification

Twenty-eight workflow tests and nine Product Insight Loader tests passed. Loader coverage includes reopening recorded attempts, retrying the identical input after a transport failure, sharing the retry allowance with invalid output after a timeout, and refusing to retry an authentication failure.

<a id="dev-note"></a>
## Dev Note

None.
