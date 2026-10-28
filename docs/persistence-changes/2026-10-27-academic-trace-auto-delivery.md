---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-27-academic-trace-auto-delivery

English | [中文](2026-10-27-academic-trace-auto-delivery.zh.md)

## Summary

Adds the required academic/trace-v1 event and an optional category on report evaluation issues nested in academic/background-run-state results. The current Session writer remains at format 4; complete background-run payloads retain schemaVersion 1.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-27-academic-trace-auto-delivery
baseline: false
changes:
  - root: "event:academic/background-run-state"
    previous: "2026-10-21-academic-u0-events"
    after: "4597342e218fd6a219340f0cedc4d3cfba1f8f511ebfba2a7004391e2e11f148"
    decision: same-version
  - root: "event:academic/trace-v1"
    previous: null
    after: "7df75da42abf2dcc007dd64d72e5778dafd6eb32dd581753371b4abc39685639"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing background-run results without category remain readable. The optional delivery/content classification supplements each issue's recorded code and message; its absence does not imply successful delivery or semantic approval. Readers retain historical report status and identities rather than reclassifying or rewriting stored reports.

The academic/trace-v1 event is required. Readers that do not recognize it reject the history under required-event admission; this record does not claim transparent compatibility with those readers. Current readers admit its declared payload, and the audited V2-to-V4 path retains persisted run/span identities, diagnostic values and nulls while remapping only the enclosing event position. The unchanged Session header version does not authorize dropping the event or inventing historical Trace observations.

The historical V2 schema now admits only the optional delivery/content category on these report issues, without changing the required fields. Both incoming migration edges preserve a supplied category and preserve its absence; unsupported category values are rejected. Current-format optionality is therefore supplemented by explicit older-format admission rather than inferred from it.

<a id="verification"></a>
## Verification

The nine-file focused Trace/controller/projection/migration run passed 430 tests with no skips. It included [Trace observations](../../packages/api/academic-research-controller/tests/trace.spec.ts), [strict V2 Trace admission](../../packages/session/session-format-v2-to-v3/tests/academic-trace.spec.ts) and [V3-to-V4 composition](../../packages/session/session-format-v3-to-v4/tests/academic.spec.ts). The final single-file Trace migration check passed 15 tests. Four owning TypeScript projects and the native Host aggregate type check passed; the final two-file lint check reported zero diagnostics.

The two incoming-edge owner suites passed 172 tests with no skips, including eight added cases for absent, delivery and content categories and refusal of an unknown value. Their four-file lint check passed 90 rules with zero diagnostics. The bounded source type check reported zero diagnostics across 30 roots and 360 loaded files, without loading the owners' built declarations; this is not a full-build result. The source type-discovery failure preceding that check remains preserved in its evidence. The check also confirmed that 223 frozen files, T0 and prior records retained their byte hashes. This verification did not execute an older reader binary, Web product, ACP or SDK replay, and did not rewrite historical Session files.

<a id="dev-note"></a>
## Dev Note

None.
