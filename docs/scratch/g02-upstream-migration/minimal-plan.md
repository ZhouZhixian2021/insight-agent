---
description: "Review a bounded proposal for audited T0 academic events in the adjacent Session migration pipeline."
owner: "A"
created: "2026-10-22"
expires: "2026-11-22"
promotion-target: "Reviewed migration specifications and package documentation"
---

# G02 minimal migration proposal

English | [中文](minimal-plan.zh.md)

## Summary

This reference records the proposed implementation scope before migration code changes. The proposal retains the adjacent 2→3→4 pipeline and current final validation. It preserves historical identities and separates successful import from approval or permission to resume. Complete historical import remains blocked until implementation and focused validation are authorized and completed.

## Table of Contents

- [Current limits](#current-limits)
- [Dev Note](#dev-note)

## Current limits
<a id="current-limits"></a>

The [inventory](event-audit.md) and [mapping](field-mapping.md) are static audit results. Migration is unimplemented. Frozen recordings cover four of 19 event types, and format-2 PTC approval metadata has no T0 writer evidence. G03 projection work, G04 platform checks, and G05 runtime/import acceptance remain separate.

## Dev Note

<details>
<summary>Unimplemented proposal and future checks</summary>

The following steps describe review material, not shipped support or commands to run now.

1. Define a fixed T0 academic schema owned by the 2→3 incoming conversion. Enumerate the 19 events, exact required/optional fields, nested structures, versions, eight references, and two audited request sources. Do not derive historical permission from the installed SessionEventMap or open an entire namespace. A version-2 header alone does not identify the producer.

2. Add exact academic admission and reference handling to 2→3. Validate log-only envelopes, payloads, earlier target kinds, and matching identities before mapping actual emitted positions. Preserve null and reject missing required fields. Reuse standard system insertion, PTC naming, cut tracking, and all non-academic behavior. Do not edit predecessor codecs or frozen dispositions.

3. Handle audited academic events before the 3→4 opaque/unknown branch. Limit this addition to input.sourceKind=transformed intermediates validated by the prior edge. Directly stored format-3 academic extensions lack this audit evidence and remain unsupported. Apply the second map, validate references even when seq is unchanged, and convert only the two declared request-source slots. Preserve visible content and private replay JSON.

4. Update the historical catalog used to collect direct-child prerequisites. Its transformed-current validation needs the fixed released-V3 plus audited T0 event set and academic payload checks. Native V3 restoreCurrent retains the released set. Do not substitute all installed event types. Production parent migration still collects complete available child evidence; only isolated transcript tests pass an explicit empty array.

5. Retain final validation, JSONL preparation, Worker verification, source-change checks, atomic publication, and inherited cuts. Future copy acceptance may create only a legal current successor; never move, overwrite, or delete committed generations. Do not change Session/Brief/call identities to make validation pass. Do not read private Sessions during this documentation work.

### Proposed files

| Owner | Proposed change |
| --- | --- |
| [migration.ts](../../../packages/session/session-format-v2-to-v3/src/migration.ts) and its payload/reference helpers | Fixed historical schema, exact admission, reference checks, and exports; independent state per Session. |
| [migration.ts](../../../packages/session/session-format-v3-to-v4/src/migration.ts) and its reference/source helpers | Second-stage academic mapping and two audited attribution conversions. |
| [historical.ts](../../../packages/session/session-format-catalog/src/historical.ts) and necessary assembly | Converted historical child reads; preserve native readers and generator ownership. |
| Owning migration/catalog/JSONL tests and paired developer docs | Focused valid/invalid cases below and persistence-type review where applicable. |

Reuse existing package dependencies to share the fixed schema. Do not duplicate the migration engine, add a direct 2→4 edge, register arbitrary runtime conversions, or weaken standard reader validation. Approval readers, Brief identity algorithms, models, presets, prompts, and user-visible copy need no change in this proposal.

### Future focused verification

These checks are planned, not executed migration evidence. Existing prior-round test counts must not be attributed to this implementation.

| Case group | Expected evidence |
| --- | --- |
| All 19 event payloads | One valid synthetic case per event and invalid field/version/content variants, including retired screening events. |
| Eight references across both edges | No insertion, each edge inserting, both edges inserting, null, wrong target/identity, absent, future, negative, fractional, and out-of-range values. |
| Dense events, seed/fork cuts and child prerequisites | Correct inherited cut, earlier inherited references, T0 child evidence, source-change refusal, and rejection of unaudited direct V3 academic input. |
| Source conversion, text, streams and opaque JSON | Only audited attribution changes; IDs, routes, text, content, stream order, private data, and ordinary numbers remain equal. |
| Checkpoint, background state and evidence graph | All nested identities, versions, counters, indices, status, scores, locators, and reports retained. |
| Approval and standard tool/PTC handling | Keep existing native meta. T0 PTC without meta gains no approval; extra format-2 meta still fails. Never infer approval from arguments or text. |
| Unknown types, fields, versions and content | Exact refusals; no event deletion, ignorable edits, automatic renaming, or fallback. Existing ignorable-extension handling remains unchanged. |
| Nine frozen projected recordings | Use the existing test materializer on temporary copies; preserve hashes and acknowledge four-of-19 coverage. Record new blockers without editing frozen samples. |
| Temporary JSONL copy, Worker verification and reopen | Requires separate copy-import authorization. Preserve source bytes, pass installed current validation, and start no model or smoke test. |

After implementation is authorized, run focused unit checks, then applicable type/lint/persistence/documentation checks and builds before a local code commit. Actual Session imports and product runs need a separately defined scope. Do not push or merge master.

### Retained blockers

A successful T0 PTC call without explicit approved=true remains insufficient. Extra format-2 meta has no audited source and must not be stripped or fabricated. Re-review creates a new Brief identity; no automatic binding to old runs is permitted.

Fifteen event types need synthetic coverage. Other branches’ extra payloads, generic Message[] variants, and native format-3 academic extensions have no automatic compatibility promise. Full historical import is still unverified; the documentation checkpoint changes none of these limits.

</details>
