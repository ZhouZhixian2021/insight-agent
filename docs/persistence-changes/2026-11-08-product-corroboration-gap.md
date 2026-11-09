---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-08-product-corroboration-gap

English | [中文](2026-11-08-product-corroboration-gap.zh.md)

## Summary

Adds optional prior comparisons to checkpoints while new corroboration pages are processed.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-corroboration-gap
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-gap-reread"
    after: "0ba487078904dd14736d4feb60a6278629390bc4814921e660ab3172b7a13f66"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing checkpoints omit priorVerifications and keep their original stage semantics. The Session decoder retains the optional field on the existing event. An older runner refuses a supplemental evidence-stage checkpoint containing retained reviews at cursor validation. The new runner validates retained comparison identities and discards them if source revalidation resets evidence.

<a id="verification"></a>
## Verification

Forty-seven targeted Product Insight tests passed, including resume from appended corroboration pages and exhaustion of the shared search allowance. A Loader test reopened a Session and verified a final report after a domain-scoped corroboration search, with review and comparison calls restricted to new evidence.

<a id="dev-note"></a>
## Dev Note

None.
