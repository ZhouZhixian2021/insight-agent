---
description: "Review the academic event audit, coordinate mapping, and proposed adjacent migration before implementation."
owner: "A"
created: "2026-10-22"
expires: "2026-11-22"
promotion-target: "Reviewed migration specifications and package documentation"
---

# G02 academic history migration review

English | [中文](index.zh.md)

## Summary

Use this reference to review the A upgrade route’s G02 migration scope. The audit covers fixed T0 source content, the pinned U0 release, and the A source snapshot identified in the evidence. Migration is not implemented and complete historical import has not passed. Existing approval and Brief identity rules remain binding.

## Table of Contents

- [Review materials](#review-materials)
- [Evidence and ownership](#evidence-and-ownership)
- [Dev Note](#dev-note)

## Review materials
<a id="review-materials"></a>

The three references separate observed event facts from proposed implementation work.

- [Event inventory](event-audit.md): 19 declarations, producer/consumer relationships, and recording coverage.
- [Field and reference mapping](field-mapping.md): eight Session references, complete top-level fields, preserved identities, and ordinary counters.
- [Minimal migration proposal](minimal-plan.md): proposed incoming-edge changes, historical child-evidence reads, refusal scope, and future focused checks.

## Evidence and ownership
<a id="evidence-and-ownership"></a>

Owner A reviews this scratch reference by the expiry date. After implementation, confirmed behavior belongs in the owning migration specifications and package documentation; the proposal remains review material until then. These pages are outside the public website allowlist.

The [audit evidence](audit-evidence.json) records source tree/blob objects, declaration fields, eight reference positions, ordinary numeric paths, and frozen-recording hashes. The [historical writer evidence](historical-writers.json) identifies the retired screening writer through its source blobs and line positions. Full revision identifiers remain in the existing external upgrade ledger and Git history; this publication adds no document-check exception.

The earlier audit verified 223 frozen copies and 4,701 protected tracked files. Publication copies neither frozen recordings nor private Session data. The external audit originals remain unchanged; machine evidence here omits copied source comments and uses source objects instead.

## Dev Note

<details>
<summary>Pending review</summary>

This is a documentation checkpoint, not migration acceptance. Do not infer approval, map Brief identities, start a model run, or publish a new Session generation from this proposal. The next authorized action is review before migration implementation.

</details>
