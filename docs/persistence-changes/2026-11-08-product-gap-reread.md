---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-08-product-gap-reread

English | [中文](2026-11-08-product-gap-reread.zh.md)

## Summary

Adds an optional marker for the completed pass over saved product source fragments.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-gap-reread
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-fragment-overlap"
    after: "a5bd59fda459069032a48cf261d697935369c674ab9f609d50919d38b33b9638"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing checkpoints omit the marker. The new runner reads them with no committed reread. Older Session readers retain the extra field on the existing checkpoint event. Older product runners refuse plans containing the new maximumGapReads key before dispatch. Session format and stage names remain the same.

<a id="verification"></a>
## Verification

The source and workflow suite passed 36 tests, including legacy checkpoint continuation and a restart after gap evidence was committed. Five Product Insight Loader tests passed. They reopen saved checkpoints and cover a successful reread and fallback to an approved search when no fragment matches.

<a id="dev-note"></a>
## Dev Note

None.
