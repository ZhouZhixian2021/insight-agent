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

Use this reference to review the A upgrade route’s G02 migration scope. The audit covers fixed T0 source content, the pinned U0 release, and the A source snapshot identified in the evidence. The reviewed 2→3→4 academic migration is now implemented and focused package checks pass; complete historical copy import has not been run. Existing approval and Brief identity rules remain binding.

## Table of Contents

- [Review materials](#review-materials)
- [Evidence and ownership](#evidence-and-ownership)
- [Dev Note](#dev-note)

## Review materials
<a id="review-materials"></a>

The three references preserve the observed event facts and the proposal reviewed before implementation.

- [Event inventory](event-audit.md): 19 declarations, producer/consumer relationships, and recording coverage.
- [Field and reference mapping](field-mapping.md): eight Session references, complete top-level fields, preserved identities, and ordinary counters.
- [Minimal migration proposal](minimal-plan.md): the reviewed incoming-edge scope, historical child-evidence reads, and refusal limits. Current behavior is specified in the owning package documents.

## Evidence and ownership
<a id="evidence-and-ownership"></a>

Owner A reviews this scratch reference by the expiry date. Confirmed behavior belongs in the owning migration specifications and package documentation; this proposal remains review material. These pages are outside the public website allowlist.

The [audit evidence](audit-evidence.json) records source tree/blob objects, declaration fields, eight reference positions, ordinary numeric paths, and frozen-recording hashes. The [historical writer evidence](historical-writers.json) identifies the retired screening writer through its source blobs and line positions. Full revision identifiers remain in the existing external upgrade ledger and Git history; this publication adds no document-check exception.

The earlier audit verified 223 frozen copies and 4,701 protected tracked files. Publication copies neither frozen recordings nor private Session data. The external audit originals remain unchanged; machine evidence here omits copied source comments and uses source objects instead.

## Dev Note

<details>
<summary>Pending review</summary>

This is an audit and design record, not complete import acceptance. Do not infer approval, map Brief identities, start a model run, or publish a new Session generation from these pages. The A-U2 matrix records implementation checks and the remaining copy-import acceptance.

</details>
