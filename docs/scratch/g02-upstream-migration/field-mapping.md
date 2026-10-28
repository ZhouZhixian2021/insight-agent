---
description: "Review exact academic Session references, complete top-level payload fields, and values that must remain unchanged."
owner: "A"
created: "2026-10-22"
expires: "2026-11-22"
promotion-target: "Reviewed migration specifications and package documentation"
---

# G02 reference and field mapping

English | [中文](field-mapping.zh.md)

## Summary

This reference distinguishes Session coordinates from business counters and opaque identities. Six event types contain eight SessionSeq positions. All 19 top-level field sets retain the same displayed types and optional markers in T0 and A; shared nested Message types still differ. The conversion rules below are proposed and have not been applied.

## Table of Contents

- [Reference positions](#reference-positions)
- [Top-level fields](#top-level-fields)
- [Preserved values](#preserved-values)
- [Dev Note](#dev-note)

## Reference positions
<a id="reference-positions"></a>

The producer saves the persisted request seq; selection allocation returns its persisted envelope seq to subsequent reviews. Nullable positions retain null. A missing required member is different from null.

| Event | Data field | Earlier target | Nullable |
| --- | --- | --- | --- |
| `academic/candidate-screening-result` | `data.requestSeq` | `academic/candidate-screening-request` | Yes |
| `academic/candidate-semantic-review-request-v1` | `data.selectionSeq` | `academic/candidate-review-selection-v1` | Yes |
| `academic/candidate-semantic-review-result-v1` | `data.selectionSeq` | `academic/candidate-review-selection-v1` | Yes |
| `academic/candidate-semantic-review-result-v1` | `data.requestSeq` | `academic/candidate-semantic-review-request-v1` | Yes |
| `academic/candidate-semantic-review-verified-v1` | `data.requestSeq` | `academic/candidate-semantic-review-request-v1` | No |
| `academic/candidate-semantic-review-verified-v1` | `data.selectionSeq` | `academic/candidate-review-selection-v1` | Yes |
| `academic/evidence-result` | `data.requestSeq` | `academic/evidence-request` | Yes |
| `academic/synthesis-result` | `data.requestSeq` | `academic/synthesis-request` | Yes |

Each edge needs its own map: r → M23[r] → M34[M23[r]]. The maps use actual emitted positions because system-message and interrupted-turn insertions change cardinality. References must name earlier existing events of the right type and matching declared identity fields, even when the numeric value does not change. Unknown, future, missing, wrong-type, or inconsistent references must fail; none may be removed or replaced with null.

## Top-level fields
<a id="top-level-fields"></a>

A question mark denotes an optional member. Complete field types, nested numeric paths, and source declaration positions are in [audit evidence](audit-evidence.json). All unlisted payload transformations are outside the proposal.

| Event | Complete top-level data fields | Session reference members |
| --- | --- | --- |
| `academic/background-run-state` | `schemaVersion`, `researchBriefId`, `state`, `startedAt`, `updatedAt`, `retrievalRunId`, `progress`, `q6`, `result`, `error`, `cancelReason`, `sessionId`, `backgroundRunId` | None |
| `academic/candidate-batch-decision` | `retrievalRunId`, `batchIndex`, `action`, `workVersionIds`, `searchQuestions`, `reason` | None |
| `academic/candidate-batch-settlement` | `retrievalRunId`, `batchIndex`, `admittedEvidence`, `coverage?`, `completedAt` | None |
| `academic/candidate-review-selection-v1` | `researchBriefId`, `researchBriefVersion`, `roundIndex`, `selection` | None |
| `academic/candidate-screening-request` | `academicWorkId`, `researchBriefId`, `researchBriefVersion`, `phase?`, `fragment?`, `config`, `messages`, `estimatedInputTokens`, `contextWindow`, `outputTokens`, `attempt`, `maxAttempts`, `decision` | None |
| `academic/candidate-screening-result` | `academicWorkId`, `researchBriefId`, `researchBriefVersion`, `usage?`, `finish?`, `phase?`, `fragment?`, `attempt`, `maxAttempts`, `status`, `requestSeq`, `elapsedMs?`, `firstContentElapsedMs?`, `failurePhase?`, `stream`, `errorCode?` | `requestSeq` |
| `academic/candidate-semantic-review-request-v1` | `workVersionId`, `roundIndex`, `selectionSeq`, `academicWorkId`, `researchBriefId`, `researchBriefVersion`, `phase?`, `fragment?`, `config`, `messages`, `estimatedInputTokens`, `contextWindow`, `outputTokens`, `attempt`, `maxAttempts`, `decision` | `selectionSeq` |
| `academic/candidate-semantic-review-result-v1` | `workVersionId`, `roundIndex`, `selectionSeq`, `academicWorkId`, `researchBriefId`, `researchBriefVersion`, `usage?`, `finish?`, `phase?`, `fragment?`, `attempt`, `maxAttempts`, `status`, `requestSeq`, `elapsedMs?`, `firstContentElapsedMs?`, `failurePhase?`, `stream`, `errorCode?` | `selectionSeq`, `requestSeq` |
| `academic/candidate-semantic-review-verified-v1` | `requestSeq`, `review`, `workVersionId`, `roundIndex`, `selectionSeq`, `academicWorkId`, `researchBriefId`, `researchBriefVersion` | `requestSeq`, `selectionSeq` |
| `academic/evidence-enhancement-selection` | `schemaVersion`, `retrievalRunId`, `workVersionId`, `selectedAt` | None |
| `academic/evidence-enhancement-settlement` | `status`, `completedAt`, `addedEvidenceRecords`, `incompleteFragments`, `schemaVersion`, `retrievalRunId`, `workVersionId`, `selectedAt` | None |
| `academic/evidence-fragment-verified` | `source`, `fragment`, `evidence`, `purpose?` | None |
| `academic/evidence-request` | `source`, `phase?`, `fragment?`, `config`, `messages`, `estimatedInputTokens`, `contextWindow`, `outputTokens`, `attempt`, `maxAttempts`, `decision` | None |
| `academic/evidence-result` | `source`, `phase?`, `fragment?`, `requestSeq`, `attempt`, `maxAttempts`, `status`, `elapsedMs?`, `firstContentElapsedMs?`, `failurePhase?`, `stream`, `finish?`, `usage?`, `errorCode?` | `requestSeq` |
| `academic/recovery-checkpoint` | `schemaVersion`, `retrievalRunId`, `startedAt`, `executedQueries`, `search`, `works`, `versions`, `candidates`, `plan`, `assessments`, `ranking`, `policy`, `rounds`, `decisions`, `settlements`, `coverage`, `papers`, `paperFailures`, `providerFailures`, `availableFulltextWorks`, `selectionTruncated`, `selectionLimitations`, `scheduledWorkVersionIds`, `completedBatchCount`, `consecutiveBatchesWithoutEvidence`, `completedSearchRounds`, `pendingBatchIndex` | None |
| `academic/run-settlement` | `retrievalRunId`, `status`, `completedAt` | None |
| `academic/search-plan` | `schemaVersion`, `researchBriefId`, `researchBriefVersion`, `maximumSearchRounds`, `queries` | None |
| `academic/synthesis-request` | `input`, `phase?`, `fragment?`, `config`, `messages`, `estimatedInputTokens`, `contextWindow`, `outputTokens`, `attempt`, `maxAttempts`, `decision` | None |
| `academic/synthesis-result` | `retrievalRunId`, `status`, `rejectedStatements?`, `usage?`, `finish?`, `phase?`, `fragment?`, `attempt`, `maxAttempts`, `requestSeq`, `elapsedMs?`, `firstContentElapsedMs?`, `failurePhase?`, `stream`, `errorCode?` | `requestSeq` |

## Preserved values
<a id="preserved-values"></a>

These distinctions prevent a broad numeric rewrite from corrupting evidence or granting new authority.

| Value group | Required preservation |
| --- | --- |
| Session, Brief, run, work, version, query, evidence, locator, claim, message and call identities | Retain all values, nested copies, and versions. A :code: fragment or a numeric suffix inside an ID is not a Session reference. |
| progress.sequence, q6.sequence, result.q6.sequence | Retain run-local counters. progress.ts increments its own sequence; pipeline.ts increments the observation sequence; q6 projection copies it. |
| Batch/round/attempt counts, scores, budgets, durations, and HTTP status | Retain ordinary numbers, including all checkpoint and background-state copies. |
| Fragment/segment/question/draft/block indices, character ranges, PDF pages and paragraph numbers | Retain source-local coordinates; never remap based on numeric equality or a name containing index/sequence. |
| Model config, message text, streams, evidence, reports, diagnostics, rejected statements | Retain routes, settings, order, content, and conclusions. Do not apply current model defaults or regenerate output. |
| Provider replayState and other declared private JSON | Preserve JSON without interpreting nested numbers as coordinates or approval evidence. |
| Envelope seq, standard surface references, inherited cut and generation-qualified captures | Use existing per-edge coordinate/cut rules. Academic log events must not gain surface metadata. Original-generation captures keep their original coordinate meaning. |

## Dev Note

<details>
<summary>Proposed conversion rules</summary>

The initial scope admits only audited T0 request/message variants. Generic Message[] declarations do not establish safe handling of every possible message role or extension. Unknown variants require their own source audit.

| Historical value | Proposed handling |
| --- | --- |
| request.messages[].source with plugin dsh-academic-workflow | Retain in the intermediate stage; convert only the audited user/text attribution to kind academic-workflow at 3→4. Keep id, role, and content. |
| request.messages[].source with plugin dsh-api-academic-research-controller | Convert the audited attribution to kind academic-candidate-review at 3→4; retain the historical screening and semantic request bodies. |
| Native tool/result wrapper and existing meta | Reuse U0 conversion and preserve the original meta; only an existing approved=true satisfies approval. |
| T0 tool/code-dispatch and a format-2 record with extra meta | Reuse standard PTC renaming and preserve pairing IDs. T0 supplies no meta; extra format-2 meta remains an unaudited refusal, without stripping or filling it. |
| New shared types such as image.offloaded, failure.offloadImages and developer messages | Do not synthesize them for T0 data. Unsupported historical roles or content tags remain explicit refusals. |

Checkpoint and background-state inspection found 76 and 186 ordinary numeric paths respectively; fragment verification contains 20. No extra declared SessionSeq was found in these payloads. These counts describe static field paths, not observed values or import test results.

</details>
