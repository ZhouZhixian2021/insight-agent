---
description: "Session-backed Remote entry for one bounded Academic research pass."
kind: "package-reference"
---
# Academic Research Controller

English | [中文](README.zh.md)

## Summary

`paperConcurrency` defaults to 3 papers per run and can be set to 1 for serial acquisition/extraction. Searches remain ordered; synthesis starts after paper tasks settle. The approved inclusion cap can reduce effective concurrency. Existing source and Web result interfaces are unchanged. Concurrency may increase upstream rate limiting and does not guarantee proportional speedup.

`@deepseek-ai/dsh-api-academic-research-controller` owns `ctx.remote.academicResearch.run` and `runStream`. One call resolves an existing Session Agent, reconstructs the ResearchBrief approved through plan review, reuses the Session's selected model, executes the approved search directions, applies deterministic metadata filters, fetches full text, reviews natural-language scope rules with the model, extracts evidence, and returns the evaluated draft.

The package exports the version-1 `AcademicResearchProgressView` and `AcademicResearchRunFrame` browser contract for live progress integration. Each progress frame is a complete monotone snapshot with the fixed retrieval, screening, full-text, extraction, analysis, and report stages. Concurrent full-text and extraction work appears in `activeStages`; the contract contains observed counts, retrieval-operation activities, work/version identity and elapsed time but no estimated completion percentage. Direct Academic Provider search, Web discovery, reference identification, and each reference verification carry distinct operation names; verification facts also carry their one-based item position. The workflow produces the shared run-local fields; model-internal batch and retry fields stay absent or `null` until their owning adapters report them. `academicResearch.runStream` carries these snapshots and one final result over a single Remote operation. The unary `academicResearch.run` remains as a compatibility path until the Web client moves to the stream.

The same stream emits `q6` frames containing complete `AcademicQ6Projection` snapshots. A snapshot binds the Session, retrieval run and exact Brief version, joins every authoritative candidate evaluation to its work, version and reviewed assessment, and exposes rounds, batch decisions and settlements, question coverage, stop decisions and limitations without recalculating them. `sequence` is monotonic within one retrieval run. Section states distinguish pending data, a completed empty value, truncation and failure. The terminal `AcademicResearchRunValue.q6` repeats the latest snapshot; it is `null` only for a legacy selector that produced no ranked workflow. The client never reconstructs these facts from Session events or starts another run to read them.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

When a tools runtime is present, the controller mounts a disposable `tools/execute` guard. An `exit_plan_mode` call carrying the Academic Brief fence is parsed and checked against executable requirements before the review tool runs, including PTC sub-dispatch. Ordinary plans delegate unchanged. The guard does not infer an Academic plan from unrelated prose. Approved Briefs are checked again at Remote admission, so older incompatible plans return actionable field diagnostics before search; they require a corrected plan and renewed approval, never silent rewriting.

The response also exposes `synthesis: { status, reasons }`, with `not_run`, `blocked`, `failed`, `completed` or `partial_success`. This settlement is independent of retrieval and review. Partial synthesis retains a draft and lists rejected candidate paragraph numbers and reasons. No valid paragraphs or invalid whole responses yield no report while preserving papers. The synthesis call uses the resolved Session model, output reserve and attempt bound.

Paper extraction results expose `extracted`, `partially_extracted`, or `extraction_failed`, with accepted `evidenceCount` and `rejectedDrafts` containing zero-based draft/segment indexes, stable rejection codes and reasons. Partial extraction contributes both success and failure to `stages.extraction`; all-rejected papers contribute failure only. The response retains these diagnostics even when no accepted evidence exists, without returning rejected model statements as evidence.

Mount the controller with `academicSource`, `sessionController`, `typert`, and `web`. The Web application mounts the Academic source runtime with OpenAlex, arXiv, CVF, ACL Anthology, and PMLR providers. `fulltextFetchProvider` defaults to `http` and selects the Web fetch provider for Academic full text only, leaving the deployment's ordinary Web fetch default unchanged. The selected provider must preserve bounded raw HTML or PDF because the evidence package rejects transformed text and truncated documents. `extractionMaxTokens` defaults to 16,384 and supplies the Academic extraction output reserve only when the Session model selection omits `maxTokens`; an explicit Session value still wins. `extractionMaxAttempts` defaults to 2 and is limited to 1 or 2; output-token exhaustion and configured transient failures may consume the second batch attempt. `extractionRetryInitialDelayMs` defaults to 10,000. Long-paper extraction uses `extractionBatchMaxInputTokens` 12,000, `extractionBatchOverlapCharacters` 512, and `extractionAttemptTimeoutMs` 120,000. These values limit each model request while preserving original segment locators across batches. `synthesisMaxAttempts` defaults to 3, and `synthesisRetryInitialDelayMs` defaults to 1,000; final synthesis retries only connection and timeout failures, doubling the delay after each failed attempt. Preview with `academicResearch.plan(sessionId)`, then call `academicResearch.runStream` with the returned `researchBriefId`, Session ID, optional global result bound, and synthetic-data disclosure. Replace the previous snapshot for that `retrievalRunId` with each `progress` frame; the sole `result` frame carries the terminal value. Open this one-shot stream once and do not place it inside a reconnecting subscription. Closing the stream, switching Session, or caller cancellation aborts the same maintenance operation and does not start another run. The unary `academicResearch.run` accepts the same request during the client transition. Both entries reject an approval identity that changed after preview. Queries come only from the approved plan; callers cannot replace them. Trimmed exact duplicates execute once, and the query count must fit both the hard limit of three and the approved `maximumSearchRounds`. The controller reads the latest successful `exit_plan_mode` review from that Session, validates its single `academic-research-brief-json` block, and adds stable identity, version 1, and approval metadata. The caller therefore cannot substitute an unreviewed Brief. Model selection remains owned by the Session. Before starting the pass, the controller resolves the Academic source and Web services from the Agent context and reports an availability error if either service is absent.

New structured plan handoffs use `schemaVersion: 4` and require `searchPlan`: each entry has `query`, a Chinese `purpose`, `questions` matching the Brief, and a `retrieval` policy reviewed with the query. Every research question needs coverage. `targetIncludedWorks` is reviewed separately from the evidence-sufficiency minimum and the hard maximum; the three counts must remain ordered. The policy selects `academic` and/or `web_discovery`, allows only OpenAlex/arXiv for direct search and OpenAlex/arXiv/ACL/PMLR/CVF for reference verification, and carries Web-discovery and verification bounds capped at eight. Channel-dependent provider lists and bounds must agree, and duplicate values, unsupported values, unknown fields, negative values, and over-limit values are rejected before review. The Controller projects this handoff into the version-1 domain Brief and separate pipeline searches. Legacy version-1 through version-3 plans remain readable; their former maximum-as-target behavior is preserved. A plan without searches cannot preview or run: the user is asked to have the system complete and reapprove it. No additional model request generates queries at run time.

Version-3 and version-4 execution binds each exact approved query to its reviewed policy. All initially approved query directions belong to search round 1; query count is bounded independently, while later rounds are reserved for evidence-gap retrieval. The Controller adapts `searchProviders()` for direct search, `web.search()` for discovery, and `verifyReference()` for authoritative verification through Academic Retrieval's `executePlannedSearchRound()`. Approved rounds and evidence-gap rounds now share this Q3 owner for query settlement, stable query provenance, ingestion, and Web-operation progress; the Controller only projects the result into the existing workflow and browser contracts. Web sources are used only to identify references; generated answers are discarded. Verified works enter the existing full-text and evidence pipeline. Version-1/version-2 queries without a retrieval policy keep the legacy `searchAll()` adapter. Web-search and verification failures contribute to `stages.search` and retain their operation categories in `retrievalRun.failures`; successful sibling results survive. The optional `hybridRetrieval` field projects completed queries: channel stages, separate URL/reference/attempt/work counts, identification issues, verification outcomes and actual ingestion merges. Candidate and reference rows include their query. Discovery URLs omit credentials, query strings and fragments; snippets, generated answers and raw errors are not returned.

Version-3 and version-4 selection preserves reviewed query-to-question provenance through ingestion, prepares conservative candidate assessments from verified metadata and current full-text resolution, calls the Academic Retrieval ranker, and passes its authoritative P0/P1/P2 queues to Q5 batch execution. Missing scholarly abstracts and keywords remain explicitly unknown, and natural-language scope rules are deferred to the existing full-text model check. Only candidates with a resolvable full-text handoff consume the configured candidate bound. `initialCandidateBatchSize` defaults to 8, `evidenceGapCandidateBatchSize` and `replenishmentCandidateBatchSize` default to 4, and `minimumQuestionSupportingWorks` defaults to 1. When an evidence-gap request leaves search-round headroom, the Controller executes a gap round — `gapRoundMaximumQueriesPerRound` defaults to 4 and `gapRoundMaximumAcademicResultsPerQuery` defaults to 20 — merges the discovered works, re-ranks, and schedules again; without round headroom the pass reports the gap as a run limitation. The Controller appends `academic/search-plan`, `academic/candidate-batch-decision`, `academic/candidate-batch-settlement`, and `academic/run-settlement` Session events; resuming a run from those events remains deferred.

The operation claims the Agent's idle phase with `runMaintenance()`. The Academic preset ends its turn after plan approval, and the client starts this operation once the Session is idle. Active chat or another maintenance operation returns `session/agent-busy`. Remote cancellation and Agent cancellation share one signal. Queries run sequentially; completed batches are merged round-robin, deduplicated, and capped by the single global candidate bound before paper selection. The response returns the workflow result, Session ID, and JSON-safe `retrievalRun` after the pass completes or observes cancellation. The run contains called providers, actually started queries, deduplicated and included work identities, coverage counts, truncation reasons, and sanitized source or paper-operation failures; it does not provide reconnect recovery.

Metadata selection uses the canonical version, approved work type, preprint policy, publication window, retraction state, and candidate-work bound. Each source provider supplies its ordered full-text candidates. After full-text parsing, the model returns an explicit included or excluded decision with a reason; excluded papers remain in the paper results and contribute no evidence to analysis. Top-level `status` reports whether the call completed or was cancelled. Producer-owned `stages.search`, `stages.fulltext`, and `stages.extraction` report each stage without requiring the client to infer it from counts. `retrievalRun.status` remains the aggregate research-processing settlement, and `report.evaluation.status` reports draft quality.

-----

Each run retains full-text candidates returned by scholarly verification under the owning provider and source-record identity. Selection reuses those results, including explicit absence, so verification-only providers need not enable catalog search and failed resolution is not repeated. Other source records use the source runtime resolver. Full-text resolution failures retain verified reference status, appear in the reference message and `retrievalRun.failures` as `resolve_fulltext`, and affect `stages.fulltext` rather than verification counts. Reports carrying `retrievalDisclosureIncluded: true` already contain the host appendix.

<a id="model-experience"></a>
## Model Experience

### Academic research run

#### What the model sees

The controller adds no prompt. It forwards the approved `inclusionRules` and `exclusionRules` to the Academic workflow's per-paper model request and uses the Session's selected provider and model.

#### Token effect

Each selected paper produces one or more ordered scope-and-evidence batches. Every batch stays under the configured estimated-input bound, retains overlap when one source segment must be split, and has its own timeout and bounded retries. A successful sibling batch survives another batch's timeout; search and full-text acquisition are not repeated. Final synthesis is a separate call whose transient retries reuse the same admitted evidence.

#### KV Cache effect

Each paper is an independent request and does not replay the Session conversation.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- CVF, ACL Anthology, and PMLR search only the catalog pages configured by the Web composition; adding a conference or volume is a configuration change.
- One one-shot Remote stream remains open for the pass. Reconnect and resume, background continuation after the caller leaves, resuming a run from the appended Q5 Session events, persisted RetrievalRun records, and search-level retries are deferred.
- Hybrid counts sum completed queries; an interrupted query is excluded and disclosed in RetrievalRun limitations. Zero completed hybrid queries omit the projection. `mergedDuplicates` counts ingested records minus distinct works before the run-wide cap, not repeated references or truncated records. Verification success does not imply candidate retention or evidence inclusion. Durable discovery-to-work provenance remains B-H3 work.
- Each approved plan currently creates Brief version 1 with an identity derived from the Session and approved plan call. Editing an already approved Brief as a later version is deferred.

-----

No invariant companion is published because the controller derives each response from the Session and workflow result without maintaining a second copy; call-time validation checks approved Plan and response relationships.

<a id="dev-note"></a>
### Dev Note

See the [Academic Remote execution decision](../../../.agents/notes/implemented/architecture/2026-09-16-academic-remote-execution.md), [explicit query orchestration decision](../../../.agents/notes/implemented/architecture/2026-09-18-academic-explicit-query-orchestration.md), [call-scoped full-text fetch decision](../../../.agents/notes/implemented/architecture/2026-09-20-call-scoped-web-fetch-provider.md), and [evidence recovery decision](../../../.agents/notes/implemented/architecture/2026-09-20-academic-evidence-extraction-recovery.md).
