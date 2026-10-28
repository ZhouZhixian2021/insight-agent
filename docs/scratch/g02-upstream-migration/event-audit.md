---
description: "Look up T0 academic event declarations, their writers and consumers, and the limits of frozen-recording coverage."
owner: "A"
created: "2026-10-22"
expires: "2026-11-22"
promotion-target: "Reviewed migration specifications and package documentation"
---

# G02 academic event inventory

English | [中文](event-audit.zh.md)

## Summary

This reference lists all 19 academic event types found in the audited T0 and A sources. U0 has no academic event declaration. Seventeen types have current T0 writers; two screening types retain historical declarations and an earlier writer. The inventory does not establish historical import support.

## Table of Contents

- [Inventory](#inventory)
- [Recording coverage](#recording-coverage)
- [Audit limits](#audit-limits)
- [Dev Note](#dev-note)

## Inventory
<a id="inventory"></a>

These are required log events. Located producers use ordinary Session append calls; they do not mark these events ignorable. Declaration and writer positions for both snapshots are recorded in [audit evidence](audit-evidence.json).

| Event | Payload | Writer | Consumer or relationship | Recorded count |
| --- | --- | --- | --- | ---: |
| `academic/background-run-state` | `AcademicBackgroundRunView` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | Background replay retains the latest view per run | 0 |
| `academic/candidate-batch-decision` | `AcademicBatchDecisionEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | Recovery plan, batch, checkpoint, or terminal facts | 0 |
| `academic/candidate-batch-settlement` | `AcademicBatchSettlementEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | Recovery plan, batch, checkpoint, or terminal facts | 0 |
| `academic/candidate-review-selection-v1` | `ReviewSelectionEvent` | [candidate-review-model.ts](../../../packages/api/academic-research-controller/src/candidate-review-model.ts) | Selection/request identities bind subsequent log records | 0 |
| `academic/candidate-screening-request` | `CandidateReviewModelRequest` | [historical writer](historical-writers.json) | Retired writer; generic history retains both events | 0 |
| `academic/candidate-screening-result` | `CandidateReviewModelResult` | [historical writer](historical-writers.json) | Retired writer; generic history retains both events | 0 |
| `academic/candidate-semantic-review-request-v1` | `SemanticReviewRequest` | [candidate-review-model.ts](../../../packages/api/academic-research-controller/src/candidate-review-model.ts) | Selection/request identities bind subsequent log records | 0 |
| `academic/candidate-semantic-review-result-v1` | `SemanticReviewResult` | [candidate-review-model.ts](../../../packages/api/academic-research-controller/src/candidate-review-model.ts) | Selection/request identities bind subsequent log records | 0 |
| `academic/candidate-semantic-review-verified-v1` | `VerifiedSemanticReview` | [candidate-review-model.ts](../../../packages/api/academic-research-controller/src/candidate-review-model.ts) | Selection/request identities bind subsequent log records | 0 |
| `academic/evidence-enhancement-selection` | `AcademicEvidenceEnhancementSelectionEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | Controller selection limit and UI enhancement interval | 0 |
| `academic/evidence-enhancement-settlement` | `AcademicEvidenceEnhancementSettlementEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | Controller selection limit and UI enhancement interval | 0 |
| `academic/evidence-fragment-verified` | `EvidenceFragmentVerifiedRecord` | [fragment-model.ts](../../../packages/academic/workflow/src/fragment-model.ts) | Verified fragment; enhancement history reads selected intervals | 0 |
| `academic/evidence-request` | `EvidenceModelRequest` | [model.ts](../../../packages/academic/workflow/src/model.ts) / [fragment-model.ts](../../../packages/academic/workflow/src/fragment-model.ts) | Logged request and settled model attempt | 4 |
| `academic/evidence-result` | `EvidenceModelResult` | [model.ts](../../../packages/academic/workflow/src/model.ts) / [fragment-model.ts](../../../packages/academic/workflow/src/fragment-model.ts) | Logged request and settled model attempt | 4 |
| `academic/recovery-checkpoint` | `AcademicResearchRecoveryCheckpoint` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | Recovery plan, batch, checkpoint, or terminal facts | 0 |
| `academic/run-settlement` | `AcademicRunSettlementEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | Recovery plan, batch, checkpoint, or terminal facts | 0 |
| `academic/search-plan` | `AcademicSearchPlanEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | Recovery plan, batch, checkpoint, or terminal facts | 0 |
| `academic/synthesis-request` | `SynthesisModelRequest` | [synthesis-model.ts](../../../packages/academic/workflow/src/synthesis-model.ts) | Logged request and settled model attempt | 4 |
| `academic/synthesis-result` | `SynthesisModelResult` | [synthesis-model.ts](../../../packages/academic/workflow/src/synthesis-model.ts) | Logged request and settled model attempt | 4 |

Recovery consumes [recovery.ts](../../../packages/academic/workflow/src/recovery.ts); background replay consumes [background-run.ts](../../../packages/api/academic-research-controller/src/background-run.ts); enhancement projection consumes [enhancement-history.ts](../../../packages/client/ui-academic-research/src/client/enhancement-history.ts). Search-plan association depends on chronology: the last plan before the first relevant run event. Migration must not invent a retrievalRunId on that event.

## Recording coverage
<a id="recording-coverage"></a>

Nine frozen academic Session v2 recordings contain 16 required academic events. Only academic-evidence and academic-limited-draft contain them: each has eight events. Evidence request/result and synthesis request/result each occur four times across the two recordings. The other 15 event types have no frozen Session-event coverage.

In each recording, result positions 4, 6, 8, and 10 refer to request positions 3, 5, 7, and 9. These are normalized body ordinals, not a claim that the frozen rows contain physical seq/time fields. The recordings contain identity templates and omit those fields. The existing llm-replay parseSessionLog test entry materializes projected rows; raw production codec input has different requirements.

## Audit limits
<a id="audit-limits"></a>

The static analysis follows nested payload fields in src only. It identifies eight SessionSeq positions in six event types. Checkpoint and complete background state contain no additional declared SessionSeq. Generic Message and stream private JSON can carry opaque provider data; the audit does not reinterpret numbers inside that data.

The T0 PTC declaration and writer do not retain meta. Four plan-review results in frozen recordings lack explicit approval metadata. A successful historical call cannot establish approval. Import, review authority, and resumability require separate evidence.

## Dev Note

<details>
<summary>Review status</summary>

The [field mapping](field-mapping.md) and [proposal](minimal-plan.md) remain unimplemented. No recording replay or actual Session import is reported by this audit.

</details>
