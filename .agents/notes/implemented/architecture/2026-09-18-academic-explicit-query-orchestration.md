# Agent Note: Academic runs execute bounded explicit queries before one paper pass

Status: implemented

English | [中文](2026-09-18-academic-explicit-query-orchestration.zh.md)

## Problem

The Web Remote accepted one search string and the workflow called the multi-source search seam once. A research brief that asks independent questions can produce an impossible conjunctive query. For example, a 2017 Transformer paper cannot also mention BERT, which was introduced later. Broad source failures also made one opaque query difficult to diagnose.

## Decision

The Controller now obtains bounded expressions from the [approved plan handoff](2026-09-21-academic-approved-plan-search.md). The pipeline still accepts at most three distinct queries within the approved Research Brief’s `maximumSearchRounds`.

`DraftPipelineInput` carries ordered `searches`. The workflow executes them sequentially through B's unchanged one-query `searchAll()` adapter. A completed batch that contains source failures does not stop later explicit queries. Configuration or unrepresented adapter errors still reject, and cancellation stops before the next query. `RetrievalRun.queries` records every query whose adapter call started, including a call interrupted by cancellation.

Completed query batches are interleaved round-robin before ingestion. Ingestion performs the existing exact-identifier reconciliation, and one global candidate-work bound applies to the deduplicated works. This keeps the first query from consuming every candidate slot and prevents one paper found by several queries from consuming several slots. Providers, discovered record counts, limitations, truncation and failures accumulate across completed batches.

The pipeline executes the supplied expressions without generating or appending queries; the approved-plan owner prepares them before the run. The workflow performs no automatic query retry.

Paper acquisition and extraction use an ordered bounded queue. The Controller resolves deployment `paperConcurrency` to 3 by default; direct library calls omit it for serial execution. Pending candidates reserve inclusion slots, avoiding response-speed-dependent selection and exceeding the approved maximum. The coordinator stops scheduling when evidence suffices, joins started tasks before synthesis, and aborts and joins siblings on durable logging failure. This reduces independent paper waiting without changing B/C interfaces; an earlier slow paper can still delay replenishment.

## Alternatives considered

**Keep one long query.** Rejected because independent subquestions may require papers from different years and vocabularies, while the catalog matcher can require every term.

**Add an LLM query planner during execution.** Deferred because it adds model cost and another decision after approval. The approved-plan owner instead prepares expressions in the existing planning turn.

**Run queries concurrently.** Rejected for this increment because ordered execution makes cancellation, source load, failure attribution and `RetrievalRun.queries` deterministic.

**Apply the candidate bound before deduplication.** Rejected because duplicate records from different queries would consume the global work budget.

## Consequences

Concurrent tests use controlled barriers to verify overlap, stable ordering, bounds, cancellation and quiescent failure. Real Session storage tests verify request-result provenance for overlapping calls; a keyless SDK composition verifies three simultaneous acquisitions. Concurrent provider load can trigger rate limits; no new retry, model setting or evidence relaxation is introduced.

The current Remote input and plan preview are owned by the [approved-plan decision](2026-09-21-academic-approved-plan-search.md). B retains the Provider interface and C retains the result projection.

Focused workflow and Controller tests cover ordered execution, round-robin candidate selection, exact deduplication across queries, continuation after a failed source batch, cancellation, query normalization, and hard or approved bounds. Adaptive query generation, retries, persistence, progress streaming and cross-run index reuse remain deferred.
