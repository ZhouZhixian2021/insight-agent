---
description: "Session-backed Remote entry for one bounded Academic research pass."
kind: "package-reference"
---
# Academic Research Controller

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-api-academic-research-controller` owns `ctx.remote.academicResearch.run`. One call resolves an existing Session Agent, reconstructs the ResearchBrief approved through plan review, reuses the Session's selected model, searches every registered academic source, applies deterministic metadata filters, fetches full text, reviews natural-language scope rules with the model, extracts evidence, and returns the evaluated draft.

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

Mount the controller with `academicSource`, `sessionController`, `typert`, and `web`. The Web application mounts the Academic source runtime with arXiv, CVF, ACL Anthology, and PMLR providers. `fulltextFetchProvider` defaults to `http` and selects the Web fetch provider for Academic full text only, leaving the deployment's ordinary Web fetch default unchanged. The selected provider must preserve bounded raw HTML or PDF because the evidence package rejects transformed text and truncated documents. `extractionMaxTokens` defaults to 16,384 and supplies the Academic extraction output reserve only when the Session model selection omits `maxTokens`; an explicit Session value still wins. `extractionMaxAttempts` defaults to 2 and is limited to 1 or 2; only output-token exhaustion consumes the second attempt. Preview with `academicResearch.plan(sessionId)`, then call `academicResearch.run` with the returned `researchBriefId`, Session ID, optional global result bound, and synthetic-data disclosure. The run rejects an approval identity that changed after preview. Queries come only from the approved plan; callers cannot replace them. Trimmed exact duplicates execute once, and the query count must fit both the hard limit of three and the approved `maximumSearchRounds`. The controller reads the latest successful `exit_plan_mode` review from that Session, validates its single `academic-research-brief-json` block, and adds stable identity, version 1, and approval metadata. The caller therefore cannot substitute an unreviewed Brief. Model selection remains owned by the Session. Before starting the pass, the controller resolves the Academic source and Web services from the Agent context and reports an availability error if either service is absent.

New structured plan handoffs use `schemaVersion: 2` and require `searchPlan`: each entry has `query`, a Chinese `purpose`, and `questions` matching the Brief. Every research question needs coverage. The Controller projects this handoff into the existing version-1 domain Brief and separate pipeline searches; the model package is unchanged. Legacy version-1 plans remain readable, but a plan without searches cannot preview or run: the user is asked to have the system complete and reapprove it. No additional model request generates queries at run time.

The operation claims the Agent's idle phase with `runMaintenance()`. The Academic preset ends its turn after plan approval, and the client starts this operation once the Session is idle. Active chat or another maintenance operation returns `session/agent-busy`. Remote cancellation and Agent cancellation share one signal. Queries run sequentially; completed batches are merged round-robin, deduplicated, and capped by the single global candidate bound before paper selection. The response returns the workflow result, Session ID, and JSON-safe `retrievalRun` after the pass completes or observes cancellation. The run contains called providers, actually started queries, deduplicated and included work identities, coverage counts, truncation reasons, and sanitized source or paper-operation failures; it does not provide reconnect recovery.

Metadata selection uses the canonical version, approved work type, preprint policy, publication window, retraction state, and candidate-work bound. Each source provider supplies its ordered full-text candidates. After full-text parsing, the model returns an explicit included or excluded decision with a reason; excluded papers remain in the paper results and contribute no evidence to analysis. Top-level `status` reports whether the call completed or was cancelled. Producer-owned `stages.search`, `stages.fulltext`, and `stages.extraction` report each stage without requiring the client to infer it from counts. `retrievalRun.status` remains the aggregate research-processing settlement, and `report.evaluation.status` reports draft quality.

-----

<a id="model-experience"></a>
## Model Experience

### Academic research run

#### What the model sees

The controller adds no prompt. It forwards the approved `inclusionRules` and `exclusionRules` to the Academic workflow's per-paper model request and uses the Session's selected provider and model.

#### Token effect

Each selected paper can produce one bounded scope-and-evidence request plus one retry only when the first response reaches its output-token cap. The workflow rejects a paper before dispatch when its estimated input plus the Session's explicit output cap or the controller's `extractionMaxTokens` reserve exceeds the selected model's context window.

#### KV Cache effect

Each paper is an independent request and does not replay the Session conversation.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- CVF, ACL Anthology, and PMLR search only the catalog pages configured by the Web composition; adding a conference or volume is a configuration change.
- One Remote call remains open for the pass. Workflow resume, progress streaming, persisted RetrievalRun records, search-level retries, and long-paper chunking are deferred.
- Each approved plan currently creates Brief version 1 with an identity derived from the Session and approved plan call. Editing an already approved Brief as a later version is deferred.

-----

No invariant companion is published because the controller derives each response from the Session and workflow result without maintaining a second copy; call-time validation checks approved Plan and response relationships.

<a id="dev-note"></a>
### Dev Note

See the [Academic Remote execution decision](../../../.agents/notes/implemented/architecture/2026-09-16-academic-remote-execution.md), [explicit query orchestration decision](../../../.agents/notes/implemented/architecture/2026-09-18-academic-explicit-query-orchestration.md), [call-scoped full-text fetch decision](../../../.agents/notes/implemented/architecture/2026-09-20-call-scoped-web-fetch-provider.md), and [evidence recovery decision](../../../.agents/notes/implemented/architecture/2026-09-20-academic-evidence-extraction-recovery.md).
