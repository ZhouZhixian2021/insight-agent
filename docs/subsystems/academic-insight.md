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

The [analysis library](../../packages/academic/analysis/README.md) returns attributed comparisons using shared Claim records. The [evaluation library](../../packages/academic/eval/README.md) reconciles current evidence with explicit semantic reviews; the [report library](../../packages/academic/report/README.md) executes evaluation at final delivery. The [standalone viewer](../../packages/client/ui-academic-research/README.md) renders portable HTML and Markdown download without a live Session or Web slot registration. Preparation and delivery views belong to their respective libraries; scholarly identities and evidence records remain owned by the shared model.

## Initial model increment

The model defines opaque ids, five-state `Availability<T>`, academic works, immutable versions, partial dates, provider records, exact external-identifier deduplication keys, versioned research briefs that require current-version approval, traceable evidence, six-section evidence cards, and immutable evidence snapshots. Provider-neutral failures, batch outcomes, and observed coverage are defined in the [model package](../../packages/academic/model/README.md). Empty successful searches remain successful; partial failures retain successful items, and truncated coverage requires a reason. RetrievalRun binds ordered queries, providers, coverage, and failures to a brief version. Its six-stage ResearchStage distinguishes lifecycle from the final batch outcome; open stages have no final status or completion time. Workflow consumers enforce approval and transitions. ClaimRecord, ClaimEvidenceLink, and ClaimAssessment preserve conclusions, opposing or supporting evidence, and review provenance. checkClaimFreshness compares the analysis snapshot against the current brief and evidence without mutation. Known changes are stale; missing evidence or hashes are unverifiable; a current result is not semantic approval. Durable parsing and execution remain outside these shared records.

The [workflow library](../../packages/academic/workflow/README.md) fills a first observed version hash and runs one search-to-draft pass. Its opt-in model adapter preserves B's request interface while accepting program-owned provenance. PaperEvidenceGenerator, EvidenceModelSource, EvidenceModelRequest and EvidenceModelResult are defined in the [workflow types](../../packages/academic/workflow/src/model-types.ts). The request event contains source identity, exact model config/messages, estimated input tokens, context/output limits and admission decision; the result references its request sequence and retains the compact stream, status, optional finish, usage and error code. Input-limit pauses preserve other papers; storage failures stop the pass. These Session records support model-call inspection, not complete workflow recovery or semantic approval.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxacademicresearchcontroller--academicresearchcontroller"></a>

### `ctx.academicResearchController` — `AcademicResearchController`

Host service backing the generated `ctx.remote.academicResearch` namespace.

```ts cordis-catalog
/**
 * Run one arXiv-backed research pass while the addressed Agent is idle.
 * @param request - approved brief, search query, disclosure, and owning Session.
 * @param signal - Remote caller lifetime; disconnect or cancellation aborts the pass.
 * @returns completed or cancelled draft data with its durable Session identity.
 */
@Remote('run') async run(request: AcademicResearchRunRequest, signal: AbortSignal): Promise<AcademicResearchRunValue>
```

Source: [`packages/api/academic-research-controller/src/index.ts`](../../packages/api/academic-research-controller/src/index.ts)
<!-- END GENERATED cordis-surface -->
