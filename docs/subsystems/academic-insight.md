---
description: "Academic insight package ownership and dependency direction."
kind: "subsystem"
---

# Academic insight subsystem

English | [中文](academic-insight.zh.md)

The analysis-local `AnalysisInput` and report-local `ReportInput` accept optional producer question/evidence associations as `questionLinks`; they do not change Academic Model or Remote fields. Empty card sections retain individually valid minimal evidence, and absent question associations remain disclosed rather than inferred. The workflow integrator owns forwarding these optional associations.

Trace v1 shares branded operation/event identifiers through the model's type-only trace subpath. The current Controller adapter persists safe observations and normalizes them for base-independent pagination; the Web panel reads only scoped Remote pages. Report HTML exports use the existing Markdown renderer with an inert allowlist serializer, preserving quality and evidence links without external resources. See the [Controller](../../packages/api/academic-research-controller/README.md) and [viewer](../../packages/client/ui-academic-research/README.md) for query and export details.

## Summary

Academic insight is an optional business subsystem built on harness extension points.

Formal research defaults to minimal-depth evidence extraction and passes verified records with their approved-question associations into an evaluated report whose automatic mode selects final or draft from delivery checks; uncovered questions remain gaps, and zero valid evidence produces no report. After the first-tier report settles, a user may select one paper with existing valid evidence for complete-depth enhancement. The existing `AcademicEvidenceEnhancementRequest` identifies `sessionId`, `retrievalRunId` and `workVersionId` for that pass. `AcademicEvidenceEnhancementView` returns the same identities, `completed` or `partial_success`, and `initialEvidenceRecords`, `addedEvidenceRecords` and `incompleteFragments`. Selection and terminal facts are persisted separately; failure or cancellation can preserve earlier verified fragments and never grants semantic approval or replaces the original report. The client reads supplemental excerpts through the existing Session journal rather than synthesizing them from counts.

## Dependency direction

`packages/academic/model` is the lowest academic layer. It may depend on shared utilities but not on retrieval, workflow, report, or client packages. Later academic packages depend inward on the model.

## Member ownership

Member A owns the shared model, workflow contracts, and integration decisions. Member B owns scholarly retrieval, candidate assessment, and provider normalization. Member C owns the research-plan and candidate interfaces. Existing evidence, analysis, and report packages retain their package-level ownership.

Shared record changes land through member A so provider-specific and report-specific concerns do not leak into the common model.

## Evidence-to-report consumers

The workflow's optional `CandidateBatchPolicy.fulltext` saves independent total and uncertain-exploration limits in recovery checkpoints. The Controller enables it for new ranked runs and owns the reusable raw/parsed source cache; the evidence library owns the optional whole-paper fragment-call bound. Scope, evidence and question coverage are always task-specific. See [full-text budgets and cache development](../cookbook/academic-fulltext-budget-cache.md).

The evidence library also provides opt-in [incremental extraction](../../packages/academic/evidence/README.md#incremental-extraction). Its fragment attempt binds paper/version identities to original source coordinates; a required verified-result sink commits successful fragments before subsequent dispatch. Recoverable failures and incomplete ranges remain separate from accepted evidence. The workflow owns model-stage output caps, durable logging, paper-scope review and temporary concurrency reduction.

The [evidence library](../../packages/academic/evidence/README.md) returns accepted records and `EvidenceExtractionResult.rejectedDrafts`. Each rejection carries zero-based `draftIndex` and `segmentIndex`, a stable `code`, and a diagnostic `reason` without source text. The workflow exposes `extracted`, `partially_extracted`, or `extraction_failed` paper settlements; only the first two supply evidence to analysis. The Academic Remote projects accepted `evidenceCount` and the rejection list for each extraction settlement. A partially extracted paper contributes both retained evidence and one failed extraction operation, while a fully rejected paper contributes no included work.

The [analysis library](../../packages/academic/analysis/README.md) returns attributed comparisons using shared Claim records. The [evaluation library](../../packages/academic/eval/README.md) checks current evidence and any supplied semantic reviews; missing independent reviews are disclosed without blocking otherwise valid delivery, while invalid supplied reviews still block it. The [report library](../../packages/academic/report/README.md) executes those checks at final delivery. The [standalone viewer](../../packages/client/ui-academic-research/README.md) renders portable HTML and exposes a Session-backed Remote Web sidebar viewer with independent run, retrieval and quality states. Preparation and delivery views belong to their respective libraries; scholarly identities and evidence records remain owned by the shared model.

The [ingestion library](../../packages/academic/ingestion/README.md) accepts an `IngestRecord` with optional verified Web discovery URLs and verification Provider IDs. `IngestOutcome.verifiedDiscoveries` links those values to the assigned `AcademicWorkId` and retained `WorkVersionId` after exact-identifier deduplication; separate versions remain addressable.

The [retrieval library](../../packages/academic/retrieval/README.md) derives channel-specific queries from an approved Brief and caller-reviewed expansion terms. Its round executor admits Web discoveries only after scholarly reference verification, then delegates exact-identifier and version merging to ingestion. Its ranker applies approved hard filters and weighted P0/P1/P2 thresholds to reviewed semantic assessments, then orders each queue for source, team, question, and topic diversity. Query IDs remain attached to the evaluated work; the Academic controller owns plan review and Session recording.

## Initial model increment

The model defines opaque ids, five-state `Availability<T>`, academic works, immutable versions, partial dates, provider records, exact external-identifier deduplication keys, versioned research briefs that require current-version approval, traceable evidence, six-section evidence cards, and immutable evidence snapshots. Provider-neutral failures, batch outcomes, and observed coverage are defined in the [model package](../../packages/academic/model/README.md). Empty successful searches remain successful; partial failures retain successful items, and truncated coverage requires a reason. RetrievalRun binds ordered queries, providers, coverage, and failures to a brief version. Its six-stage ResearchStage distinguishes lifecycle from the final batch outcome; open stages have no final status or completion time. Workflow consumers enforce approval and transitions. ClaimRecord, ClaimEvidenceLink, and ClaimAssessment preserve conclusions, opposing or supporting evidence, and review methods and assessed evidence identities. checkClaimFreshness compares the analysis snapshot against the current brief and evidence without mutation. Known changes are stale; missing evidence or hashes are unverifiable; a current result is not semantic approval. Durable parsing and execution remain outside these shared records.

The [workflow library](../../packages/academic/workflow/README.md) fills a first observed version hash and runs one bounded explicit-query-to-draft pass. It executes at most three caller-planned queries sequentially within the approved Brief round limit, merges query batches round-robin, deduplicates exact identities, and applies one global candidate bound. It returns a terminal RetrievalRun containing observed providers, actually started queries, coverage, truncation, and source or paper-operation failures; the Remote controller exposes that JSON-safe run to Web clients. Ranked scheduling also publishes complete query-workflow observations; the Controller projects their plan, candidates, rounds, batches, question coverage and stop decision into monotonic `AcademicQ6Projection` frames and repeats the latest frame in the terminal result. Its run-local progress snapshots distinguish merged work identities, merged version records, retained versions, and suspected duplicates; paper activities carry both work and version IDs, and the shared format accepts Provider activities. Its opt-in model adapter preserves the evidence generator request interface while accepting program-owned source metadata. PaperEvidenceGenerator, PaperScopeDecision, EvidenceModelSource, EvidenceModelRequest and EvidenceModelResult are defined in the [workflow types](../../packages/academic/workflow/src/model-types.ts). The model first decides admission from the first evidence batch and approved rules; an excluded paper skips extraction, while insufficient context pauses it. Included papers use compact evidence-only responses over ordered token-bounded batches, with original locator indexes restored before exact-source verification. Each attempt can have an operation-local timeout and bounded transient retry; validated sibling batches survive one batch failure. The request event contains source identity, phase, exact model config/messages, estimated input tokens, context/output limits and admission decision; the result references its request sequence and retains the compact stream, status, optional finish, usage, error code and local timing diagnostics. Historical events without a phase remain readable. Storage failures stop the pass. Automatic query planning is not provided. These Session records support model-call inspection, not complete workflow recovery or semantic approval.

Candidate selection uses the Retrieval coverage selector before bounded model review; the deployment review budget is independent of the Plan candidate ceiling. The Controller [review policy](../../packages/api/academic-research-controller/README.md#model-experience) limits concurrency to two, logs minimal requests and verified judgments under versioned Session events, and projects explicit `CandidateAssessment.semanticReview` settlements through Q6. Screening progress reports review counts separately from deduplicated-work totals; skipped works retain lexical assessments.

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

/**
 * Enhance one user-selected paper after its first-tier draft has settled.
 * @param request Completed run and selected paper identity.
 * @param signal Caller lifetime; cancellation preserves the original report and committed fragments.
 * @returns Separate evidence counts; this operation does not revise or approve the original report.
 */
@Remote('enhanceEvidence') async enhanceEvidence(request: AcademicEvidenceEnhancementRequest, signal: AbortSignal): Promise<AcademicEvidenceEnhancementView>

/**
 * Stream complete workflow progress snapshots followed by one final result.
 * @param request - previewed approval identity, disclosure, and the Session containing the plan.
 * @param signal - Remote caller lifetime; disconnect or cancellation aborts this one pass.
 * @returns ordered progress frames and at most one terminal result frame.
 */
@Remote({ mode: 'stream' }) runStream(request: AcademicResearchRunRequest, signal: AbortSignal): AsyncIterable<AcademicResearchRunFrame>

/**
 * Start a Session-owned research task whose lifetime does not depend on the browser connection.
 * @param request Approved plan identity and bounded run options.
 * @param signal Caller lifetime used only before admission; disconnect after admission leaves the task running.
 * @returns Persisted initial state and its independent background run ID.
 */
@Remote('startBackgroundRun') async startBackgroundRun(request: AcademicResearchRunRequest, signal: AbortSignal): Promise<AcademicBackgroundRunView>

/**
 * Read the latest Session-owned task state, including after a host restart.
 * @param key Session and background run identity.
 * @returns Latest durable state; an unclosed task from a previous host is marked interrupted.
 */
@Remote('getBackgroundRun') async getBackgroundRun(key: AcademicBackgroundRunKey): Promise<AcademicBackgroundRunView>

/**
 * Find this Session's recent task IDs after a page refresh or reconnection.
 * @param sessionId Owning Session identity.
 * @returns At most 20 small discovery rows, oldest first, with live tasks overriding persisted snapshots.
 */
@Remote('listBackgroundRuns') async listBackgroundRuns(sessionId: AcademicResearchRunRequest['sessionId']): Promise<readonly AcademicBackgroundRunSummary[]>

/**
 * Subscribe to a task without taking ownership of its lifetime.
 * @param key Session and background run identity.
 * @param signal Subscriber lifetime; disconnect only ends this subscription.
 * @returns Current view followed by live updates, or one terminal/recovered view.
 */
@Remote({ mode: 'stream' }) async *watchBackgroundRun(key: AcademicBackgroundRunKey, signal: AbortSignal): AsyncIterable<AcademicBackgroundRunView>

/**
 * Explicitly cancel an active task; closing a viewer never calls this method.
 * @param request Session-owned run identity and user cancellation reason.
 * @returns Latest state, including the durable cancellation intent.
 */
@Remote('cancelBackgroundRun') async cancelBackgroundRun(request: AcademicBackgroundRunCancelRequest): Promise<AcademicBackgroundRunView>

/**
 * Read safe diagnostics for one owned Session/run without starting or cancelling research.
 * @param query Scope, stage/state filter, stable cursor and page bound.
 * @param signal Viewer request lifetime; never cancels research.
 * @returns Latest-operation page, or explicit absence for historical runs.
 */
@Remote('traceList') async traceList(query: AcademicTraceQuery, signal: AbortSignal): Promise<AcademicTracePage>

/**
 * Read an operation's original observations under the same scoped pagination rules.
 * @param query Session/run scope and required span identity.
 * @param signal Viewer request lifetime.
 * @returns Operation and its chronological observations; raw model content is excluded.
 */
@Remote('traceDetail') async traceDetail(query: AcademicTraceQuery, signal: AbortSignal): Promise<AcademicTracePage>
```

Source: [`packages/api/academic-research-controller/src/index.ts`](../../packages/api/academic-research-controller/src/index.ts)
<!-- END GENERATED cordis-surface -->

`AcademicBackgroundRunKey` binds a host-owned task ID to its Session; `AcademicBackgroundRunCancelRequest` adds the explicit `user_requested` reason. `AcademicBackgroundRunView` stores the latest state, progress, Q6 projection and terminal result as one Session event. `AcademicBackgroundRunSummary` is the smaller discovery row returned by `listBackgroundRuns`; clients fetch a selected complete view separately. A subscriber's AbortSignal ends only viewing. An unfinished saved task without a live host owner appears as `interrupted`, with its last observed retrieval ID and progress; checkpoint recovery is an explicit new run.

Question synthesis is owned by the [analysis library](../../packages/academic/analysis/README.md) and dispatched by the [workflow](../../packages/academic/workflow/README.md). `AcademicSynthesisInput` binds an approved Brief version, RetrievalRun identity, accepted analysis records and observed coverage. `AcademicSynthesisDraft` contains cited statements, one ordered answer per question, sections, limitations and optional direction components referencing the same statements. Its optional `writingStyle: evidence_narrative` selects B-style prose and results tables in the C report renderer; it changes no shared paper or Controller input. Existing drafts without directions remain question-only; new direction layouts follow the [report library](../../packages/academic/report/README.md). The Remote adds `synthesis: { status: "not_run" | "blocked" | "failed" | "completed" | "partial_success", reasons: readonly string[] }`; retrieval statistics remain retrieval-only. Question answers are not semantic approvals.

The workflow exports the `AcademicResearchRecoveryState` contract and the pure A-S2 `reconstructAcademicResearchRecoveryState()` fold. Given a complete ordered Session log and exact run/Brief identity, it rebuilds the approved plan, completed batches, ordered pending candidates, latest committed coverage, and terminal state. A-S3 adds durable executable checkpoints at ranked-batch boundaries. `run` and `runStream` accept an optional `resumeRetrievalRunId`; the Controller acquires the Session write handle, validates the latest checkpoint, skips retrieval and screening, preserves the original run identity, avoids settled batches, and retries one unsettled batch as a unit. Historical incomplete runs without checkpoint payloads fail explicitly with `candidate_state_missing`.

The workflow captures source-checked extraction before synthesis and supplies it to report evaluation as `admittedEvidence`. Host reports append observed retrieval facts and expose optional `report.retrievalDisclosureIncluded: true`; the client then preserves Markdown without a second appendix. Verified identities with unavailable full text remain verified; `resolve_fulltext` failures affect the full-text stage and retain a category in the reference message.
