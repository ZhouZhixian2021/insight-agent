# Agent Note: Reviewed academic query retrieval

Status: implemented

English | [中文](2026-09-30-academic-reviewed-query-retrieval.zh.md)

## Problem

The shared search plan identifies channel-specific queries and candidate provenance, but the existing draft workflow sends one expression to Academic and Web channels and cannot derive verified candidates from those query identities. Web discovery text must not enter the scholarly evidence chain without provider verification.

## Decision

The `dsh-academic-retrieval` library derives a first-round plan from an approved Brief, explicit provider and result limits, Brief aliases, and caller-reviewed synonym or method terms. It emits separate Academic, Web, and site-restricted queries with `SearchQueryId` values. Coverage from the same Brief version can add bounded evidence-gap queries in an unused round. The library does not infer method names from prose or change the shared Brief format.

The round executor dispatches each query to its channel. Web results become works only after reference identification and verification by an allowed scholarly provider. Each query reports discovery, identification, verification, failure, and limit facts. Ingestion performs exact-identifier deduplication and version merging; optional `IngestRecord.discoveredBy` query IDs survive a repeated-version merge, so the returned work-to-query mapping reflects every contributing record.

The Academic controller owns plan review, Session events, runtime adapters, and later batch decisions. The library performs no model call and publishes no Session event.

## Alternatives considered

**Put planning in Academic Source.** That would make a provider-selection service own ResearchBrief semantics and ingestion decisions.

**Treat identified Web references as works.** Identification only extracts an identifier from untrusted Web content and cannot establish official metadata or version identity.

**Infer expansion terms from free-text rules.** The Brief has no structured method-term field; heuristic inference could narrow or widen an approved search without review.

## Consequences

The controller can integrate Q2/Q3 through a plain library API while retaining its own review and logging responsibilities. Callers must supply reviewed expansion terms, execution adapters, and budgets. Citation-seed execution and durable progress remain separate work. Focused tests cover query bounds and channel assignment, coverage identity, unverified Web exclusion, partial failures, deduplication, and merged query provenance.
