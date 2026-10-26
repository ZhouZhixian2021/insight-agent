# Agent Note: Academic Trace adapters

Status: implemented

English | [中文](2026-10-21-academic-trace-adapters.zh.md)

## Problem

Academic diagnostics need run, paper and attempt identities across two base-upgrade routes. Existing Session observations omit some run links and separate execution timings; a UI tied to raw events would require route-specific rewrites and could invent historical facts.

## Decision

Shared branded types live in academic-model with a public type-only trace subpath. The current adapter records safe academic/trace-v1 observations in the owning Session using an explicitly allocated retrieval run identity. Full-text fetch, candidate review, scope, evidence and synthesis operations report separate calls and attempts; transport retries retain their original failures. Stage and paper records use observed workflow identities. The Controller normalizes current Session records; trace-query paginates and summarizes unified observations without importing Session types. The Web panel consumes only the scoped Remote result.

Cursors bind the Session, run, filter and immutable event watermark. Summary totals describe the same watermark and never sum concurrent child durations. Unknown queue times remain null; closed or interrupted runs retain unfinished operation states with a missing-observation notice. Queries and exports contain no prompts, response streams, URLs, credentials or raw errors. Diagnostics do not determine evidence admission or report approval. The versioned event is required on read; older readers that do not recognize it refuse the log rather than silently claiming complete history. Released generations are not rewritten.

## Alternatives considered

Parsing Session JSONL in the UI couples presentation to persistence generations and exposes raw content. Inferring calls from titles or adjacent timestamps merges unrelated operations. Copying all requests into a second store duplicates sensitive data. The [Session lineage and event tracing](../../implemented/feature/2026-07-13-session-query-tracing.md) remains a separate relationship query.

## Consequences

A/B can reuse shared types, observation queries and presentation while adapting their own base observations. Historical runs without Trace return an explicit gap; no model reruns fill missing history. Separate fragment-generator invocations remain separate logical calls, and provider search internals and post-draft enhancement are not fully traced. New adapters must supply facts rather than infer those missing relationships. Scoped fixture replay, model transport retry tests and the real Web composition pin the intended behavior.
