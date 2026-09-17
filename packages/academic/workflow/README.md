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

Pass the reconciled WorkVersion, successful EvidenceExtractionInput, an explicit boolean indicating historical content or evidence, an EvidenceGenerator, and optional cancellation signal. First observation requires not_extracted and no historical binding; matching hashes reuse the version. For extracted results, pass version and evidence together downstream instead of the original unfilled version.

paused contains work and version IDs, old and new hashes, source URL, acquisition time, and a machine-readable reason. Paused papers never invoke the generator, overwrite conflicting content, or mint a version. Generator errors and cancellation propagate to the caller rather than becoming hash conflicts.

Returned paper records share readonly references; they are not deeply frozen or durable snapshots. No invariant companion is published because this library has no registrations or independently maintained runtime service observations; the model adapter dispatches immutable request data read directly from its persisted Session event, and call-time checks verify storage correspondence.

## Single-pass research draft

runResearchDraft accepts an approved Brief, one explicit query and synthetic disclosure. It orders search → ingestion → version selection → per-paper full-text parsing and extraction → analysis → an evaluated draft report. Selection admits one version per work and is fully checked before acquisition.

Callers supply search, selectPapers, fetcher, generator and now. search returns `AcademicSourceSearchBatchResult` from `ctx.academicSource.searchAll()`, and fetcher can adapt ctx.web.fetch. `selectResearchPapers()` applies deterministic version, date, work-type, retraction and preprint rules through a provider-owned full-text resolver; its `PaperSelectionResult` records whether the approved included-work bound omitted another eligible paper. Generator and clock are explicit; this library reads no credentials, creates no network client and introduces no generic scheduler.

Search results respect maximumCandidateWorks and the request bound; selection respects maximumIncludedWorks. Unapproved input, duplicate works, unknown versions and excluded/retracted selections reject. Hash conflicts return pauses; model scope exclusions retain their reason without contributing evidence. Acquisition or extraction failures retain the version and failed stage while other papers continue. The terminal `RetrievalRun` combines source and paper failures, deduplicated and included work counts, successful full-text acquisitions, called providers, executed queries, and explicit truncation reasons. Reports disclose the same incomplete-coverage observations without claiming complete coverage.

Output status=completed means only that this pass finished, not that research or review is sufficient. `retrievalRun.status` independently reports success, partial success, or failure from included works and recorded failures; an all-source failure therefore returns a blocked draft with a failed retrieval run. report always uses draft mode and empty semantic reviews; report.evaluation carries quality status. Cancellation returns cancelled with completed papers, failures, observed coverage, and no report. Configuration and unrepresented search failures reject. Callers own durable model/network records and deadline cancellation signals.

Automatic repeated search, retries, cross-round index recovery, saturation rules and stopping as soon as evidence counts are met remain subsequent work. This pass has no automatic abstract fallback or final publication. The main Web application invokes it through `@deepseek-ai/dsh-api-academic-research-controller`.

## Model response validation

`parsePaperModelResponse(text)` accepts one JSON object containing a scope decision, reason and at most six evidence entries. `parseEvidenceDrafts(text)` returns its EvidenceDraft values. Validation requires an empty evidence array for excluded papers and checks the result bound, all six card sections, required fields, enums and Availability values before returning any drafts. Empty evidence and empty cardItems are accepted; excess entries, unknown fields, invented identities, failed availability and malformed responses throw EvidenceError with code EVIDENCE_INVALID_MODEL_OUTPUT. Diagnostics identify a field path without copying response content.

The model has no producer-owned failure IDs, so failed availability is rejected; unknown, not_applicable and not_extracted remain available for absent information. B retains source-index bounds and exact excerpt checks. Parsing alone does not verify semantic support, stream completion or input budgets. Callers must reject incomplete model streams before parsing and preserve raw responses in their own durable records; this function neither calls a model nor records a Session.

## Session-backed model extraction

Bind createModelEvidenceGenerator(ctx, session, config) to a live Session with an active persistence writer and explicit LlmCallConfig. The context requires llm, sessions, sessionPersistence and tokenMeter. The configured provider resolves its model capacity and output cap; missing capacity or cap fails that paper before dispatch. No model name, credential, timeout or token cap is invented here; callers select the route and supply cancellation/deadlines.

The returned PaperEvidenceGenerator accepts B's request, parsed provenance and approved natural-language scope rules and can be assigned directly to runResearchDraft's generator. B receives its unchanged EvidenceGenerationRequest; the A-owned wrapper associates the call with the work, version, content hash, source, extraction method and scope decision.

Application callers use `runAcademicResearchDraft({ ctx, session, model, input, adapters, signal })`. This stable entry checks the exact model route before search or acquisition. An omitted reasoning effort uses the model route default; an explicit caller choice is preserved and validated. Unsupported explicit reasoning fails before external paper work begins. The result includes `sessionId` and the terminal `retrievalRun` alongside the per-paper states, failures, analysis and report so callers can locate the durable model records and present observed coverage.

`runModelResearchDraft(ctx, session, config, input, adapters, signal)` remains the lower-level composition entry. Supply search, selectPapers, fetcher and now in adapters; it binds the model generator and runs the existing pipeline through B's parsing/evidence and C's analysis/evaluated draft. Neither entry owns the Session lifecycle. Brief approval, selection policy, deadlines, report storage and publication remain caller responsibilities.

Each request and result is appended, flushed through SessionStore and read back from persistence before progress. Missing writers, append failures, rejected checkpoints or mismatched stored events throw WorkflowLogError and stop the entire research pass, including when cancellation races that failure. Result recording is not cancelled with the model request. A crash during streaming can leave a recorded request without a result; automatic resume is not implemented.

## Model Experience

### Session-backed model extraction

#### What the model sees

`createModelEvidenceGenerator()` sends B's instructions, approved inclusion and exclusion rules, the scope-decision and six-section JSON requirements, focus questions and all ordered text/locator segments as a tool-free request. The model first records whether the full text satisfies the scope rules and why. Included papers select only direct answers to the focus questions, return at most six entries and at most three entries primarily supporting one question, and avoid exhaustive extraction. Ancillary datasets, benchmark scores, hardware, training time and routine hyperparameters are excluded unless they answer a focus question. Model request data comes from the immutable academic/evidence-request event; academic/evidence-result retains the lossless compact stream, usage when supplied, and validated/failed/cancelled/skipped status. Validated means JSON validation only. These log-only events do not enter the main conversation history.

#### Token effect

DSH's existing message estimator counts the complete framed input. Input estimate plus the resolved output-token cap must fit the model context window; excess is logged and returns input_too_large through the paper handoff without dispatch or truncation. This heuristic is not exact tokenization: a provider can still reject an admitted request. Other papers continue after input-limit pauses and ordinary model errors.

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

- This library provides a single-pass draft pipeline, paper handoff and opt-in model adapter. Session logging covers model requests and settlements; the returned RetrievalRun, evidence/card identities, and complete workflow state are not persisted for recovery. Long-paper chunking, automatic retries and final semantic review remain subsequent work. It does not prove scholarly identity or distinguish format changes from content revisions.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

See [paper handoff decision](../../../.agents/notes/implemented/architecture/2026-09-15-academic-paper-handoff.md) and [tests](tests/handoff.spec.ts).

</details>
