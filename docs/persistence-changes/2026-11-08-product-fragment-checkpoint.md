---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-08-product-fragment-checkpoint

English | [中文](2026-11-08-product-fragment-checkpoint.zh.md)

## Summary

Adds an optional in-page fragment cursor to product investigation checkpoints.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-fragment-checkpoint
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "7283f744becf9d5abb73431e438001e03b5de6c28d6398707e0a0c939efd5a47"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Current readers treat an absent fragmentIndex as the previously settled page cursor, so existing checkpoints remain usable. New partial-page checkpoints retain the original page index and a positive fragmentIndex. An older workflow rejects that cursor during recovery rather than reusing incomplete page evidence as complete; a new plan containing maximumPageCharacters also fails its older plan parser rather than silently expanding source work.

<a id="verification"></a>
## Verification

Product source and workflow tests: 27 passed, including long-page offsets, fragment checkpoint recovery, and the legacy 12000-character bound. The real Loader product investigation test passed with two long pages and four extraction requests.

<a id="dev-note"></a>
## Dev Note

None.
