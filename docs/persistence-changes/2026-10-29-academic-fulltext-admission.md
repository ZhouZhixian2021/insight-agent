---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-29-academic-fulltext-admission

English | [中文](2026-10-29-academic-fulltext-admission.zh.md)

## Summary

Adds optional full-text admission limits to Academic recovery checkpoint policies.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-29-academic-fulltext-admission
baseline: false
changes:
  - root: "event:academic/recovery-checkpoint"
    previous: "2026-10-21-academic-u0-events"
    after: "61471586a9abf01fd7a87fc04fa5d520e48ab86620f0bdb3c5699b8eeba5b2cb"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Historical checkpoints omit policy.fulltext and retain their original scheduling behavior. New checkpoints save total and uncertain-work limits; current recovery counts already scheduled identities rather than renewing their allowances. Older readers ignore the optional object and preserve the existing required checkpoint fields; use the current reader when resuming a run whose full-text limits must be enforced. No event discriminators or released generations change.

<a id="verification"></a>
## Verification

Focused candidate-batch, replenishment and Controller tests cover historical policies, consumed full-text limits and pending-batch recovery. Whole-paper fragment limits and cache contents do not add Session fields.

<a id="dev-note"></a>
## Dev Note

None.
