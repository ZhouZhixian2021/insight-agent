# Agent Note: Academic runs execute bounded explicit queries before one paper pass

Status: implemented

English | [中文](2026-09-18-academic-explicit-query-orchestration.zh.md)

## Problem

The Web Remote accepted one search string and the workflow called the multi-source search seam once. A research brief that asks independent questions can produce an impossible conjunctive query. For example, a 2017 Transformer paper cannot also mention BERT, which was introduced later. Broad source failures also made one opaque query difficult to diagnose.

## Decision

The existing browser request keeps its `query: string` field. The Controller interprets non-empty lines as ordered explicit queries, trims whitespace, removes exact repeats, and accepts at most three. The query count must also fit the approved Research Brief's `maximumSearchRounds`; an invalid count is rejected before maintenance work starts. A one-line caller remains unchanged.

`DraftPipelineInput` carries ordered `searches`. The workflow executes them sequentially through B's unchanged one-query `searchAll()` adapter. A completed batch that contains source failures does not stop later explicit queries. Configuration or unrepresented adapter errors still reject, and cancellation stops before the next query. `RetrievalRun.queries` records every query whose adapter call started, including a call interrupted by cancellation.

Completed query batches are interleaved round-robin before ingestion. Ingestion performs the existing exact-identifier reconciliation, and one global candidate-work bound applies to the deduplicated works. This keeps the first query from consuming every candidate slot and prevents one paper found by several queries from consuming several slots. Providers, discovered record counts, limitations, truncation and failures accumulate across completed batches.

No model plans, rewrites, or appends queries. The workflow performs no automatic retry.

## Alternatives considered

**Keep one long query.** Rejected because independent subquestions may require papers from different years and vocabularies, while the catalog matcher can require every term.

**Add an LLM query planner.** Deferred because it adds model cost, nondeterminism, another recorded decision, and new approval semantics before the explicit-query path is stable.

**Run queries concurrently.** Rejected for this increment because ordered execution makes cancellation, source load, failure attribution and `RetrievalRun.queries` deterministic.

**Apply the candidate bound before deduplication.** Rejected because duplicate records from different queries would consume the global work budget.

## Consequences

The Remote contract remains source-compatible for current Web callers. A client can later expose a multiline input without changing the request type. Brief plans that use two or three queries must approve a matching `maximumSearchRounds`. B keeps the existing provider API, and C keeps the existing result projection.

Focused workflow and Controller tests cover ordered execution, round-robin candidate selection, exact deduplication across queries, continuation after a failed source batch, cancellation, query normalization, and hard or approved bounds. Adaptive query generation, retries, persistence, progress streaming and cross-run index reuse remain deferred.
