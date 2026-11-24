---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-24-product-paragraph-review-repair

English | [中文](2026-11-24-product-paragraph-review-repair.zh.md)

## Summary

Product page checkpoints can record the draft paragraph count and the positions omitted after a partial review. A failed review event can identify a complete model response with invalid paragraph decisions.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-24-product-paragraph-review-repair
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-23-product-page-summary-review"
    after: "46ee65aa64278ef7db6d42b3eaa08d46d52fd95b776c9ded3376d7439f757ecf"
    decision: same-version
  - root: "event:product/page-summary-result-v1"
    previous: "2026-11-23-product-page-summary-review"
    after: "9c160f028c6d308225420d8316d6daeba19475d3e5dde971fbee760270348d53"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Both fields are optional. Existing checkpoints keep their approved paragraphs. On resume the reader validates any recorded omissions and replays marked responses only for the same page snapshot, model and exact request. Older readers can use the saved approved paragraphs and will retry a failed response if needed.

<a id="verification"></a>
## Verification

Focused Vitest cases in investigation.spec.ts and extraction-model.spec.ts exercised partial reports, grounded edits, two targeted repairs, rejected omissions outside the draft, cancellation and replay of an interrupted repair. An offline replay of an actual five-paragraph review retained four paragraphs when the remaining correction failed twice.

<a id="dev-note"></a>
## Dev Note

None.
