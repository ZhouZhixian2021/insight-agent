---
description: "Academic insight package ownership and dependency direction."
kind: "subsystem"
---

# Academic insight subsystem

English | [中文](academic-insight.zh.md)

## Summary

Academic insight is an optional business subsystem built on harness extension points.

## Dependency direction

`packages/academic/model` is the lowest academic layer. It may depend on shared utilities but not on retrieval, workflow, report, or client packages. Later academic packages depend inward on the model.

## Member ownership

Member A owns the shared model, workflow contracts, and integration decisions. Member B owns provider normalization and single-paper evidence production. Member C owns cross-paper claims, coverage assessment, and report presentation.

Shared record changes land through member A so provider-specific and report-specific concerns do not leak into the common model.

## Evidence-to-report consumers

The [evidence library](../../packages/academic/evidence/README.md) returns accepted records and `EvidenceExtractionResult.rejectedDrafts`. Each rejection carries zero-based `draftIndex` and `segmentIndex`, a stable `code`, and a diagnostic `reason` without source text. The workflow exposes `extracted`, `partially_extracted`, or `extraction_failed` paper settlements; only the first two supply evidence to analysis. The Academic Remote projects accepted `evidenceCount` and the rejection list for each extraction settlement. A partially extracted paper contributes both retained evidence and one failed extraction operation, while a fully rejected paper contributes no included work.

The [analysis library](../../packages/academic/analysis/README.md) returns attributed comparisons using shared Claim records. The [evaluation library](../../packages/academic/eval/README.md) reconciles current evidence with explicit semantic reviews; the [report library](../../packages/academic/report/README.md) executes evaluation at final delivery. The [standalone viewer](../../packages/client/ui-academic-research/README.md) renders portable HTML and exposes a Session-backed Remote Web sidebar viewer with independent run, retrieval and quality states. Preparation and delivery views belong to their respective libraries; scholarly identities and evidence records remain owned by the shared model.

The [ingestion library](../../packages/academic/ingestion/README.md) accepts an `IngestRecord` with optional verified Web discovery URLs and verification Provider IDs. `IngestOutcome.verifiedDiscoveries` links those values to the assigned `AcademicWorkId` and retained `WorkVersionId` after exact-identifier deduplication; separate versions remain addressable.

## Initial model increment

The model defines opaque ids, five-state `Availability<T>`, academic works, immutable versions, partial dates, provider records, exact external-identifier deduplication keys, versioned research briefs that require current-version approval, traceable evidence, six-section evidence cards, and immutable evidence snapshots. Provider-neutral failures, batch outcomes, and observed coverage are defined in the [model package](../../packages/academic/model/README.md). Empty successful searches remain successful; partial failures retain successful items, and truncated coverage requires a reason. RetrievalRun binds ordered queries, providers, coverage, and failures to a brief version. Its six-stage ResearchStage distinguishes lifecycle from the final batch outcome; open stages have no final status or completion time. Workflow consumers enforce approval and transitions. ClaimRecord, ClaimEvidenceLink, and ClaimAssessment preserve conclusions, opposing or supporting evidence, and review provenance. checkClaimFreshness compares the analysis snapshot against the current brief and evidence without mutation. Known changes are stale; missing evidence or hashes are unverifiable; a current result is not semantic approval. Durable parsing and execution remain outside these shared records.

The [workflow library](../../packages/academic/workflow/README.md) fills a first observed version hash and runs one bounded explicit-query-to-draft pass. It executes at most three caller-planned queries sequentially within the approved Brief round limit, merges query batches round-robin, deduplicates exact identities, and applies one global candidate bound. It returns a terminal RetrievalRun containing observed providers, actually started queries, coverage, truncation, and source or paper-operation failures; the Remote controller exposes that JSON-safe run to Web clients. Its opt-in model adapter preserves B's request interface while accepting program-owned provenance. PaperEvidenceGenerator, EvidenceModelSource, EvidenceModelRequest and EvidenceModelResult are defined in the [workflow types](../../packages/academic/workflow/src/model-types.ts). The request event contains source identity, exact model config/messages, estimated input tokens, context/output limits and admission decision; the result references its request sequence and retains the compact stream, status, optional finish, usage and error code. Input-limit pauses preserve other papers; storage failures stop the pass. Automatic query planning and retries are not provided. These Session records support model-call inspection, not complete workflow recovery or semantic approval.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxacademicresearchcontroller--academicresearchcontroller"></a>

### `ctx.academicResearchController` — `AcademicResearchController`

Host service backing the generated `ctx.remote.academicResearch` namespace.

```ts cordis-catalog
/**
 * Preview the latest approved plan without starting retrieval or calling a model.
 * @param sessionId Session whose research plan the user wants to execute.
 * @returns Chinese research intent, search directions, and the approval identity to pass to run.
 */
@Remote('plan') async plan(sessionId: AcademicResearchRunRequest['sessionId']): Promise<AcademicResearchPlanView>

/**
 * Run one multi-source research pass while the addressed Agent is idle.
 * @param request - previewed approval identity, disclosure, and the Session containing the plan.
 * @param signal - Remote caller lifetime; disconnect or cancellation aborts the pass.
 * @returns completed or cancelled draft data with its observed retrieval run and durable Session identity.
 */
@Remote('run') async run(request: AcademicResearchRunRequest, signal: AbortSignal): Promise<AcademicResearchRunValue>
```

Source: [`packages/api/academic-research-controller/src/index.ts`](../../packages/api/academic-research-controller/src/index.ts)
<!-- END GENERATED cordis-surface -->

Question synthesis is owned by the [analysis library](../../packages/academic/analysis/README.md) and dispatched by the [workflow](../../packages/academic/workflow/README.md). `AcademicSynthesisInput` binds an approved Brief version, RetrievalRun identity, accepted analysis records and observed coverage. `AcademicSynthesisDraft` contains cited statements, one ordered answer per question, sections and limitations. The Remote adds `synthesis: { status: "not_run" | "blocked" | "failed" | "completed" | "partial_success", reasons: readonly string[] }`; retrieval statistics remain retrieval-only. Question answers are not semantic approvals.
