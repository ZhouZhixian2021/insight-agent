---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-18-product-evidence-reading-context

English | [中文](2026-11-18-product-evidence-reading-context.zh.md)

## Summary

Product evidence can retain excerpt-grounded attribution and measurement conditions.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-18-product-evidence-reading-context
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-ranked-fragments"
    after: "bbb9652a5a15177701e6a078bf34349fa8e6244ec333d40844943dbcbacebf24"
    decision: same-version
  - root: "event:product/evidence-v1"
    previous: "2026-11-08-product-pdf-page"
    after: "cc1e39a583621bf982be420efa111451f98e1c0d62169ea528ae51b6d2ee419a"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The readingContext field is optional. Existing sessions can omit it and the writer treats attribution as unknown. Evidence identities, excerpts and offsets remain unchanged.

<a id="verification"></a>
## Verification

Replayed 163 historical synthesis items and checked that the original statements, excerpts and aliases matched. Focused extraction tests reject unmatched qualifiers while preserving the evidence.

<a id="dev-note"></a>
## Dev Note

None.
