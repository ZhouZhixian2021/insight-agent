---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-10-product-passage-evidence

English | [中文](2026-11-10-product-passage-evidence.zh.md)

## Summary

Adds separate version 2 product evidence and checkpoint events plus passage-selection model request and result events for question-targeted extraction.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-product-passage-evidence
baseline: false
changes:
  - root: "event:product/checkpoint-v2"
    previous: null
    after: "0e36a5f3263ab61a8b3f6e9a98352544e326d63bd760563b8522c2c075475a03"
    decision: same-version
  - root: "event:product/evidence-v2"
    previous: null
    after: "c59db7efe0b9f34236123bab69f2727dd0490adb8fc83c427fe8c16a6b9aae58"
    decision: same-version
  - root: "event:product/passage-model-request-v1"
    previous: null
    after: "f82cfb258d8f114d99dca5e91a57fbc8be58b39c3d7906a1ac5df9d7e114532d"
    decision: same-version
  - root: "event:product/passage-model-result-v1"
    previous: null
    after: "c4a0f7f3ae46fea3fd167769456ae60fc48a470929cab0e652c7f4ee498148c7"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing product/evidence-v1 and product/checkpoint-v1 event shapes remain unchanged. The reader accepts either event family. Versions 1–3 checkpoints resume their original fragment algorithm; version 4 checkpoints resume by saved question cursor and require version 2 evidence. Each retained quote is rechecked against the saved source hash and text range before reuse. Older readers can ignore the new event names without misinterpreting the legacy records.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/product-insight/source/tests/passage-index.spec.ts packages/product-insight/workflow/tests/investigation.spec.ts --reporter=dot: 43 tests passed, including multi-excerpt positions, legacy recovery, and version 4 question-cursor recovery. pnpm run build:artifacts: 7 gates passed.

<a id="dev-note"></a>
## Dev Note

None.
