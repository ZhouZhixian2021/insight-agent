---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-08-product-ranked-fragments

English | [中文](2026-11-08-product-ranked-fragments.zh.md)

## Summary

Records the dispatch order of an unfinished product evidence page.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-ranked-fragments
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-pdf-page"
    after: "2a75e5e4df5f543b6eda9fc42e9e6005deeccd089c2aefb80ef411c09647087b"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Version 3 checkpoints record a ranked sequence of canonical fragment start offsets when a page is unfinished. Their cursor counts dispatched windows in that sequence. The current reader resumes versions 1 and 2 in source order using their original layouts. Older readers reject version 3 before dispatch, since their cursor assumes source order. The Session event name and format version remain valid.

<a id="verification"></a>
## Verification

Product source and workflow tests verify ranking across approved questions, unchanged offsets and draft allowances, rejection of invalid permutations, and resumption with both ranked and legacy cursors.

<a id="dev-note"></a>
## Dev Note

None.
