---
description: "Paper-level hash handoff from full-text parsing to evidence extraction."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-workflow

English | [中文](README.zh.md)

## Summary

extractPaperEvidence fills a first observed version hash before invoking the existing evidence extractor, retaining the version ID and historical objects. Conflicts return paused so callers can retain the record and continue other papers.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Progress types are exposed through the type-only `@deepseek-ai/dsh-academic-workflow/progress` entry. Browser consumers use this entry to avoid importing host Session declarations through the execution barrel.

Warning admission does not satisfy the replenishment stop condition. After the candidate pool or inclusion cap is exhausted, `continue_with_warning` permits a limited draft from positive usable evidence; `stop_for_review` blocks synthesis. Warning drafts return `synthesis.status=partial_success` and host-owned reasons. Cancellation and zero usable evidence never start synthesis.

`includedWorkTypes` filters `WorkVersion.versionType`: `preprint`, `accepted_manuscript`, or `version_of_record`. Conference and journal categories are not version states. `allowPreprints: false` takes precedence. The pipeline also rejects adapter-selected versions outside the approved list before fetching; venue labels do not determine eligibility. `validateResearchBriefRequirements()` exposes the shared analysis check for plan review callers.

The formal entry admits evidence and invokes question synthesis with the Session model. Paper extraction can retry output-limit exhaustion plus configured `TRANSPORT` and `TIMEOUT` failures, reusing the same parsed paper request without repeating search or acquisition. Final synthesis can separately retry configured `TRANSPORT` and `TIMEOUT` failures with exponential backoff, reusing the admitted evidence without repeating search, acquisition or extraction. Output-limit exhaustion consumes at most one recovery attempt whose smaller request retains approved questions, paper identities and verified excerpts while removing duplicate version, locator and card data. A second output-limit failure stops with `SYNTHESIS_MODEL_OUTPUT_LIMIT`; it never repeats the compact request. `academic/synthesis-request` records each exact request; `academic/synthesis-result` records every attempt's raw output, usage and rejection diagnostics. Partial paragraph acceptance is logged as `partially_validated`; all rejected paragraphs produce `failed` with `SYNTHESIS_NO_VALID_STATEMENTS`. Earlier events and failures before JSON parsing omit `rejectedStatements`. The Remote returns `partial_success` plus rejection reasons and a draft when valid paragraphs survive; no valid paragraphs means no report. Invalid whole responses, insufficient evidence, exhausted retries or cancellation also return no report. Durability failures stop the run. No template fallback, automatic semantic repair or weakened references are used.

Pass the reconciled WorkVersion, successful EvidenceExtractionInput, an explicit boolean indicating historical content or evidence, an EvidenceGenerator, and optional cancellation signal. First observation requires not_extracted and no historical binding; matching hashes reuse the version. For extracted results, pass version and evidence together downstream instead of the original unfilled version.

paused contains work and version IDs, old and new hashes, source URL, acquisition time, and a machine-readable reason. Paused papers never invoke the generator, overwrite conflicting content, or mint a version. Generator errors and cancellation propagate to the caller rather than becoming hash conflicts.

Returned paper records share readonly references; they are not deeply frozen or durable snapshots. No invariant companion is published because this library has no registrations or independently maintained runtime service observations; the model adapter dispatches immutable request data read directly from its persisted Session event, and call-time checks verify storage correspondence.

## Bounded research draft

Candidates start and settle in selection order, with up to `paperConcurrency` acquisitions/extractions in flight (omitted means 1). An earlier slow candidate can delay ordered settlement and replenishment. Each unsettled candidate reserves one inclusion slot; usable evidence plus reservations cannot exceed the approved inclusion cap. Exclusions, pauses, failures and empty evidence release their slots. After each settlement, evidence admission checks the independent-work and full-text minimums. When `stopWhenEvidenceRequirementsMet` is satisfied, no new paper starts; already-started papers finish, so evidence may exceed the minimum within the inclusion cap. Cancellation stops new work and joins active tasks; durable logging failure aborts siblings and rejects after joining them. Coverage distinguishes evidence sufficiency, inclusion cap, selector truncation and candidate exhaustion, not downloads alone. Queries and requirements are unchanged.

runResearchDraft accepts an approved Brief, one to three ordered explicit queries, and synthetic disclosure. The query count must also fit the Brief's `maximumSearchRounds`. It runs the queries sequentially, then orders merged ingestion → version selection → per-paper full-text parsing and extraction → analysis → an evaluated draft report. Selection admits one version per work and is fully checked before acquisition.

`executeHybridSearch()` is the policy-aware discovery unit for one approved query. It starts direct Academic search and DSH Web discovery together, identifies DOI/arXiv/ACL/PMLR/CVF references from bounded Web candidates, removes exact repeated references, applies the approved verification-provider list and attempt limit, and admits only verified works to the Academic batch. Repeated references use one verification attempt but retain every discovery URL with its verification Provider. Exact identifiers merge direct and verified records before the candidate bound applies to distinct works; every retained work keeps its separate versions, so the returned record count may exceed `maxResults`. One channel or reference failure retains successful sibling results; caller cancellation aborts the operation. The returned observation keeps Academic records, Web URLs, identified references, verification attempts and outcomes as separate counts for the later Remote projection. The caller supplies all four operations explicitly, so Provider lookup remains in Academic Source and generic Web access remains in `ctx.web`.

Callers supply search, selectPapers, fetcher, generator, synthesize and now. search returns `AcademicSourceSearchBatchResult` from `ctx.academicSource.searchAll()`, and fetcher can adapt ctx.web.fetch. `selectResearchPapers()` applies deterministic version, date, work-type, retraction and preprint rules through a provider-owned full-text resolver; its `PaperSelectionResult` records whether the candidate selector omitted another eligible paper. Generator and clock are explicit; this library reads no credentials, creates no network client and introduces no generic scheduler.

Callers may also provide `onProgress`. The workflow then publishes complete, monotonically sequenced run-local snapshots for retrieval, screening, full-text work, evidence extraction, analysis and report generation. Ingestion observations distinguish merged work identities, merged version records, retained versions and suspected duplicates. Concurrent paper activities carry work and version identities; the shared format also accepts Provider activities from the Academic Source observer. Successful papers and validated evidence survive sibling failures, and cancellation retains all counts committed before the terminal cancellation snapshot. Subscriber exceptions are contained and cannot change research settlement. Provider activities, model-internal batch indexes and retry indexes remain absent or `null` until their owning adapters publish those facts. These snapshots do not include `sessionId` and are not a Remote stream; the Controller owns that later projection.

Each query uses the same candidate bound. Completed query batches are merged round-robin so an earlier query cannot consume the global bound alone, exact identifiers are deduplicated, and all returned works enter preliminary date, version-state and full-text-URL screening. Only eligible works consume the global candidate allowance, bounded by `maximumCandidateWorks` and the request bound. URL resolution does not download or guarantee parseable full text. Per-query discovery and verification bounds still apply before results reach this workflow. `coverageSummary.deduplicatedWorks` records the returned records after cross-query deduplication but before the aggregate run applies its global bound; `academicWorkIds` contains the validated selected candidates and stays empty if the run stops before selection. Selection returns the eligible candidate pool under `maximumCandidateWorks`; processing stops at `maximumIncludedWorks` works with usable evidence. Unapproved input, too many queries, duplicate selected works, unknown versions and excluded/retracted selections reject. A failed source batch does not block a later explicit query; configuration or unrepresented search errors still reject. Hash conflicts return pauses; model scope exclusions retain their reason without contributing evidence. Acquisition or extraction failures retain the version and failed stage while other papers continue. Known extraction failures are classified without exposing model output: invalid model JSON/content is `parse_failed`, missing model budget is `invalid_request`, incomplete model output is `upstream_error`, and other extraction failures are `unknown`. The terminal `RetrievalRun` combines source and paper failures, deduplicated and included work counts, successful full-text acquisitions, called providers, actually started queries, and explicit truncation reasons. Reports disclose the same incomplete-coverage observations without claiming complete coverage.

Output status=completed means only that this pass finished, not that research or review is sufficient. `retrievalRun.status` independently reports success, partial success, or failure from included works and recorded failures; an all-source failure therefore returns a blocked draft with a failed retrieval run. report always uses draft mode and empty semantic reviews; report.evaluation carries quality status. Cancellation returns cancelled with completed papers, failures, observed coverage, and no report. Configuration and unrepresented search failures reject. Callers own durable model/network records and cancellation; a non-null Plan maximumElapsedMinutes adds a deadline shared by search, extraction and synthesis.

The Academic Controller mounts the hybrid executor for approved version-3 queries and retains the Academic-only legacy path. `DraftSearchResult.hybridObservation` travels through the pipeline into optional `hybridSearch` run facts. Completed queries retain observations; interrupted queries appear only in RetrievalRun limitations and started queries. Counts of admitted records, exact merged records and distinct works are settled from ingestion before the run-wide work cap. Original contributions remain in the observation before per-query version reconciliation, so merging the same version does not erase its duplicate count. Duplicate references and records excluded by per-query bounds are not work merges. The Controller projects these facts without returning raw Web content. Automatic query expansion, cross-run recovery, abstract fallback and final publication remain outside this pass.

## Model response validation

`parsePaperModelResponse(text)` accepts one JSON object containing a scope decision, reason and at most six evidence entries. `parseEvidenceDrafts(text)` returns its EvidenceDraft values. Validation requires an empty evidence array for excluded papers and checks the result bound, all six card sections, required fields, enums and Availability values before returning any drafts. Empty evidence and empty cardItems are accepted; excess entries, unknown fields, invented identities, failed availability and malformed responses throw EvidenceError with code EVIDENCE_INVALID_MODEL_OUTPUT. Diagnostics identify a field path without copying response content.

The model has no producer-owned failure IDs, so failed availability is rejected; unknown, not_applicable and not_extracted remain available for absent information. B retains source-index bounds and exact excerpt checks. Parsing alone does not verify semantic support, stream completion or input budgets. Callers must reject incomplete model streams before parsing and preserve raw responses in their own durable records; this function neither calls a model nor records a Session.

## Session-backed model extraction

Paper settlements distinguish `extracted`, `partially_extracted`, and `extraction_failed`. Accepted records from a partially extracted paper participate in analysis with their original provenance; rejected drafts never enter cards or report citations. A paper with only rejected drafts remains visible but contributes no included work. Each affected paper contributes one `extract_evidence` failure operation, irrespective of the number of rejected drafts; per-draft indexes and reasons remain in `evidence.rejectedDrafts`. Coverage and report limitations disclose accepted and rejected counts. This does not add model retries or relax whole-response JSON validation; JSON `validated` is distinct from exact-source verification.

Bind `createModelEvidenceGenerator(ctx, session, config, policy)` to a live Session with an active persistence writer, explicit `LlmCallConfig`, and a positive `maxAttempts`. The context requires llm, sessions, sessionPersistence and tokenMeter. The configured provider resolves its model capacity and output cap; missing capacity or cap fails that paper before dispatch. `inputBatchTokenLimit` partitions ordered source segments by the complete framed-input estimate; an oversized individual segment is split with `inputBatchOverlapCharacters`, and local indexes are mapped back before source verification. `attemptTimeoutMs` bounds preparation and streaming for each dispatch. Output-limit and configured transient failures may retry. Tool calls, invalid JSON, unsupported content, admission failures and external cancellation are never retried. Callers select the model route and all deployment limits.

The returned PaperEvidenceGenerator accepts B's request, parsed provenance and approved natural-language scope rules and can be assigned directly to runResearchDraft's generator. B receives its unchanged EvidenceGenerationRequest; the A-owned wrapper associates the call with the work, version, content hash, source, extraction method and scope decision.

Application callers use `runAcademicResearchDraft({ ctx, session, model, modelPolicies, input, adapters, signal })`. `modelPolicies.evidence` and `modelPolicies.synthesis` independently select their attempt limits, transient failure codes and initial retry delays. This stable entry checks the exact model route before search or acquisition. An omitted reasoning effort uses the model route default; an explicit caller choice is preserved and validated. Unsupported explicit reasoning fails before external paper work begins. The result includes `sessionId` and the terminal `retrievalRun` alongside the per-paper states, failures, analysis and report so callers can locate the durable model records and present observed coverage.

`runModelResearchDraft(ctx, session, config, policies, input, adapters, signal)` remains the lower-level composition entry. Supply search, selectPapers, fetcher and now in adapters; it binds extraction and synthesis generators to their separate policies and runs the existing pipeline through B's parsing/evidence and C's analysis/evaluated draft. Neither entry owns the Session lifecycle. Brief approval, selection policy, deadlines, report storage and publication remain caller responsibilities.

Each attempt's request and result records include its attempt number and bound, then are appended, flushed through SessionStore and read back from persistence before progress. Missing writers, append failures, rejected checkpoints or mismatched stored events throw WorkflowLogError and stop the entire research pass, including when cancellation races that failure. Result recording is not cancelled with the model request. A crash during streaming can leave a recorded request without a result; automatic resume is not implemented.

At paper settlement, the workflow captures an independent copy of accepted, source-checked extraction records before exposing the working evidence graph to synthesis. Reports pass this batch as `admittedEvidence`; changed or added cited evidence is rejected, including in drafts. Host reports receive `retrievalDisclosure` derived from completed queries, approved budgets, counts and failures. Web snippets and candidate URLs do not become report evidence or bibliography. A verified identity with a full-text resolution failure stays verified and contributes a separate `resolve_fulltext` failure.

## Model Experience

### Session-backed model extraction

#### What the model sees

`createModelEvidenceGenerator()` sends B's instructions, approved inclusion and exclusion rules, the scope-decision and six-section JSON requirements, focus questions and all ordered text/locator segments as a tool-free request. Program-owned source provider and source URL accompany the segments so scope review can recognize an already established official source or stable identifier without requiring the body text to repeat it. This metadata cannot support a research claim. The model first records whether the full text satisfies the scope rules and why. Included papers select only direct answers to the focus questions, return at most six entries and at most three entries primarily supporting one question, and avoid exhaustive extraction. Ancillary datasets, benchmark scores, hardware, training time and routine hyperparameters are excluded unless they answer a focus question. Model request data comes from the immutable academic/evidence-request event; academic/evidence-result retains the lossless compact stream, usage when supplied, and validated/failed/cancelled/skipped status. Validated means JSON validation only. These log-only events do not enter the main conversation history.

#### Token effect

DSH's existing message estimator counts the complete framed input. With batching enabled, each batch must fit both the configured input limit and the model context after reserving output tokens. Successful batches are merged in source order, duplicate drafts are removed, and at most six drafts continue to exact-source verification. A failed batch leaves validated sibling evidence available and marks the paper partially extracted; all failed batches fail the paper. This heuristic is not exact tokenization, so a provider can still reject an admitted request.

#### KV Cache effect

Each extraction sends only its own paper request, without replaying the main conversation. No cross-paper cache-reuse guarantee is made.

### Evidence handoff

#### What the model sees

`extractPaperEvidence()` adds no prompt; it invokes B’s extractor and the caller-supplied generator only after successful handoff.

#### Token effect

The handoff itself consumes no model tokens; extraction tokens and request logging belong to the caller.

#### KV Cache effect

No model cache policy changes.

## Known Limitations and Deferred Work

- This library provides a bounded explicit-query draft pipeline, paper handoff and opt-in model adapter. Session logging covers model requests and settlements; the returned RetrievalRun, evidence/card identities, and complete workflow state are not persisted for recovery. Adaptive query planning, workflow-level recovery and final semantic review remain subsequent work; a source provider may repeat transient transport attempts within its own configured bound. It does not prove scholarly identity or distinguish format changes from content revisions.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

See the [paper handoff decision](../../../.agents/notes/implemented/architecture/2026-09-15-academic-paper-handoff.md), the [explicit query orchestration decision](../../../.agents/notes/implemented/architecture/2026-09-18-academic-explicit-query-orchestration.md), the [evidence recovery decision](../../../.agents/notes/implemented/architecture/2026-09-20-academic-evidence-extraction-recovery.md), the [hybrid retrieval decision](../../../.agents/notes/implemented/architecture/2026-09-22-academic-hybrid-retrieval-contract.md), and [tests](tests/handoff.spec.ts).

</details>
