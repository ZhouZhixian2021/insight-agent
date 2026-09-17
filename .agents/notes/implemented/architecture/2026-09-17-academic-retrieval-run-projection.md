# Agent Note: Academic workflow returns observed retrieval coverage to Web clients

Status: implemented

English | [中文](2026-09-17-academic-retrieval-run-projection.zh.md)

## Problem

The Academic workflow consumed only the flat successful works from `searchAll()`, so source failures, called providers, pre-bound record counts, and source limits disappeared before analysis. The Remote result exposed paper settlements and the draft but could not tell the Web client whether retrieval was complete, partially successful, failed, or cancelled with partial observations.

## Decision

`DraftPipelineAdapters.search` consumes `AcademicSourceSearchBatchResult`. The workflow ingests `batch.items`, preserves `batch.failures`, and settles one `RetrievalRun` on completion or cancellation. Coverage counts provider-returned records before the aggregate bound, deduplicated works after ingestion, extracted works admitted to analysis, successful full-text acquisitions, and all recorded source/full-text/extraction failures. Abstract-only and metadata-only counts remain zero because this pass has no fallback at those levels.

`selectResearchPapers()` returns `PaperSelectionResult`: the selected papers plus `truncated`. Selection continues only until it observes one additional eligible, resolvable paper beyond `maximumIncludedWorks`, which proves the limit omitted a candidate without resolving every remaining work. Declared source coverage limits, source truncation or failure, an observed selection bound, paper-operation failures, and paused papers mark coverage as truncated and add credential-free limitations.

Paper acquisition and extraction failures keep the existing `PaperProcessingFailure` view and also produce a `ProviderFailure` tied to the selected source and `workVersionId`. Full-text acquisition uses `fulltext_unavailable`; extraction uses `parse_failed`; both messages are fixed and contain no caught exception text. A source or paper failure beside an extracted work yields `partial_success`; failures without an extracted work yield `failed`; a valid empty run without failures remains `success`. Lifecycle stage stays separate: cancellation uses `cancelled`, a terminal failed batch uses `failed`, and other completed passes use `completed`.

`AcademicResearchRunValue` requires the workflow's `retrievalRun` unchanged. Branded IDs are strings at runtime and every nested field is JSON-safe, so the Controller does not create a second browser-only run type. The top-level completed/cancelled status, retrieval batch status, and report evaluation remain independent.

## Alternatives considered

**Build coverage in the Controller.** Rejected because the Controller does not observe ingestion, successful full-text acquisition, model scope decisions, or paper-local failures at their commit points.

**Infer providers and failures from returned papers.** Rejected because zero-result and failed providers do not appear in paper records, and a paper cannot reconstruct pre-bound discovery counts or source limits.

**Treat every completed Remote call as retrieval success.** Rejected because all providers can fail while the bounded pass still returns a blocked draft that explains the failure.

## Consequences

The fixed Web fixture and the real Remote response share the required `retrievalRun` field. Web clients can render partial success, failure, cancellation, coverage counts, and limitations without inspecting paper arrays. The run is returned but is not persisted or streamed; reconnect recovery, live progress, retries, per-provider counts, abstract fallback, and long-paper chunking remain outside this decision.

Focused workflow and Controller suites cover successful coverage, partial and all-source failure, paper failures, source and included-work bounds, cancellation, and the Remote projection. Package READMEs and the Academic subsystem page own the caller-facing behavior.
