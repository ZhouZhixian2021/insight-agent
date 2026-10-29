---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-29-academic-scope-screening

English | [中文](2026-10-29-academic-scope-screening.zh.md)

## Summary

Adds an optional condition-targeted screening record to Academic scope-review requests; requests recorded before this change remain readable.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-29-academic-scope-screening
baseline: false
changes:
  - root: "event:academic/candidate-screening-request"
    previous: "2026-10-21-academic-u0-events"
    after: "390fbd81f8ac356d4cab60f99c36f2e9f7aebd206b3a6484a42c2843738deff9"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-request-v1"
    previous: "2026-10-21-academic-u0-events"
    after: "94c0a474782b49d351998215d0c450a41c3fd000f8a1856ba742f2e6e74105c9"
    decision: same-version
  - root: "event:academic/evidence-request"
    previous: "2026-10-21-academic-u0-events"
    after: "24fcde40400fd2dc9562116a3f0a34001028c0374353ba43b8f32c81d384eacf"
    decision: same-version
  - root: "event:academic/synthesis-request"
    previous: "2026-10-21-academic-u0-events"
    after: "f9aaf313699cda70b0cdf22aa6ed3acc47fc5ff3a048a83c140c742f2071f33d"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Historical scope-review requests omit the screening object and keep their original sequential batch behavior. New requests record the windows every dispatch showed and the remaining dispatch budget, so a resumed or replayed run reads the same material. No event discriminator changes; older readers ignore the optional field and keep every required request field.

<a id="verification"></a>
## Verification

Focused selector, scope-screening and candidate-batch tests cover dispatch budgeting, masked re-reads, uncovered conditions and reserved exploration. The persistence catalog and this acknowledgement are generated and checked in the same change.

<a id="dev-note"></a>
## Dev Note

None.
