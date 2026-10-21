# Agent Note: Academic Trace adapters

Status: proposed

English | [中文](2026-10-21-academic-trace-adapters.zh.md)

## Problem

Academic diagnostics need run, paper and attempt identities across two base-upgrade routes. Existing Session observations omit some run links and separate execution timings; a UI tied to raw events would require route-specific rewrites and could invent historical facts.

## Proposal

Use the [C-T0 handoff](../../../../z-team_docs/模块分工/academic-trace-v1-interface-handoff.md) as a reviewable proposal with synthetic fixtures. Version-specific adapters produce a shared projection; queries and presentation consume that projection. A/B verify upgraded observation points before C implements current-base collection. Missing identity or timing remains unknown. Default queries and exports contain allowlisted diagnostic summaries, not model messages or raw errors.

## Alternatives considered

Parsing Session JSONL in the UI couples presentation to persistence generations and exposes raw content. Inferring calls from paper titles or adjacent timestamps merges unrelated operations. Copying all requests into a second store duplicates sensitive data without recovering missing identity. These approaches are excluded from the proposal.

## Acceptance criteria

The fixture validator must retain a failed first attempt after retry success, reject conflicting duplicate events, preserve cancellation and interrupted observations, and avoid summing concurrent durations. A/B must document supported and missing observation mappings. Runtime acceptance additionally requires scoped query authorization, durable replay, stable pagination and redaction checks; fixture validation alone does not satisfy these criteria.

## Risks

Historical extraction and candidate-review events cannot always be assigned to one research run. New observation identities may be required, with separate persistence review. The proposal does not alter the existing [Session lineage and event tracing](../../implemented/feature/2026-07-13-session-query-tracing.md), which answers different relationship queries and remains active.
