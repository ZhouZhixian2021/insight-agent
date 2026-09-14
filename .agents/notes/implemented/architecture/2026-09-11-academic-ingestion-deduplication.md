# Agent Note: Academic ingestion - deduplication and version merging as a pure library

Status: implemented

English | [中文](2026-09-11-academic-ingestion-deduplication.zh.md)

## Problem

A provider normalizes each captured record into a fresh `AcademicWork`/`WorkVersion` pair, so one research work that appears as a preprint and a published version, or across OpenAlex, Crossref, and arXiv, arrives as several unrelated identities. Downstream evidence and analysis must refer to a single work per paper, with each concrete version addressable, or version deduplication will be repeated by every consumer.

The shared model deliberately stops at the deduplication-key primitive (`externalIdentifierDedupKey`) and records no durable mapping ([model README](../../../../packages/academic/model/README.md)). The dedup rules are B's responsibility ([interface requirements](../../../../z-team_docs/模块分工/academic-retrieval-evidence-interface-requirements.md)): explicit external identifiers merge automatically, title/author/year similarity only marks a suspected duplicate, and a work's identity must not change when dedup rules later change.

## Decision

`@deepseek-ai/dsh-academic-ingestion` (`packages/academic/ingestion`) is a pure library. It owns deduplication, version merging, and canonical-version selection; the index is an immutable value a caller passes in and out, so the durable mapping and persistence stay later increments.

1. **Exact keys** are the `externalIdentifierDedupKey` of every external identifier a record carries (DOI, arXiv, OpenAlex, PubMed, provider record). Any collision means the same work.
2. **Fuzzy key** folds normalized title, first author, and year. A fuzzy collision is reported as `suspected_duplicate` and never auto-merged, matching the "do not auto-merge without an identifier" rule.
3. **Stable identity**: a new work receives a fresh `createAcademicWorkId()`; the index maps every exact key it carries to that id, so a later record sharing any identifier merges into the same id. Re-running with changed dedup rules cannot renumber an id already assigned in the index.
4. **Merging** re-points every version at the assigned work identity, unions external identifiers, and reconciles the work: the record whose version is canonical owns title, authors, publication status, and venue; `workVersionIds` is the union; `firstPublicDate` is the earliest available date.
5. **Canonical version** prefers `version_of_record` > `corrected` > `accepted_manuscript` > `preprint` among non-retracted versions, tie-broken by the later release date and then ingestion order; retracted versions are candidates only when none other exists.

The library consumes `IngestRecord` (a `{ academicWork, workVersion }` pair), which is structurally the source seam's `AcademicSourceWork`, so provider output flows in without a dependency on `dsh-academic-source`.

## Package topology

```text
@deepseek-ai/dsh-academic-model  <--depends on--  @deepseek-ai/dsh-academic-ingestion
      shared records + key                        library (createIngestIndex / ingestWorks)
```

Ingestion depends only on the shared model. It defines no Cordis service and no provider; a workflow increment can wrap the index in a service later.

## The index and audit

`IngestIndex` holds `byExactKey` (external-identifier key → `AcademicWorkId`), `byFuzzyKey` (fuzzy key → `AcademicWorkId`), and `records` (`AcademicWorkId` → contributing records in ingestion order). `ingestWorks(index, records)` returns the updated index, the deduplicated `works` and re-pointed `versions`, and an `IngestAudit` whose entries are `new_work`, `merged_version`, or `suspected_duplicate`.

## Alternatives considered

### Make ingestion a Cordis service holding the index

Rejected for this increment. The workflow has no consumer yet, and a service would lock the state behind Cordis wiring without adding correctness. A pure state-transformer is fully testable and can be wrapped in a service when the workflow drives it; the note to revisit is "wrap the index in a service once a consumer needs shared state".

### Reuse the first record's provider-minted id as the stable identity

Rejected. Provider-minted ids are per-record carriers; ingestion owns work identity so the index, not the first record's shape, is the single source of the mapping.

### Auto-merge fuzzy title/author/year matches

Rejected. The interface requirements reserve fuzzy similarity for human confirmation; auto-merging would silently collapse distinct works that share a common title, author, and year.

## Consequences

**Provider ids are carriers.** Each normalized record's `academicWorkId` is discarded and replaced by the index-assigned identity; only the index's assignment is authoritative.

**Fuzzy matches are advisory.** A batch whose versions share only a fuzzy key remains split until an exact identifier links them or a human confirms the suspected duplicate.

**Identity is append-only per index.** Assigning an id never rewrites an earlier one; changing the fuzzy normalization later can re-flag suspected duplicates but cannot split or renumber already-merged works.

**No durability.** The index lives in memory; persistence, the durable mapping record, and merge-audit fields await a separate accepted design.

## Deferred work

- Durable persistence of the index and its audit.
- Within-batch clustering of records that share only a fuzzy key.
- `firstPublicDate` precision-aware comparison (parse mixed year/day precision rather than compare ISO text).
- The workflow/service wrapper that owns a long-lived index and feeds deduplicated works into evidence production.
