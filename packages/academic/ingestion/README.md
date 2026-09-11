---
description: "Academic ingestion: deduplication and version merging over provider-normalized records."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-ingestion

English | [中文](README.zh.md)

## Summary

`dsh-academic-ingestion` deduplicates provider-normalized `AcademicWork`/`WorkVersion` records into stable work identities and merges their versions. It is a library, not a Cordis service or plugin, and performs no network requests or model calls. Exact external-identifier collisions merge automatically; a title/author/year collision without a shared identifier is reported as a suspected duplicate and never auto-merged.

## Table of Contents

- [Use this package](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Academic retrieval feeds each captured record through `ingestWorks()` against a caller-held `IngestIndex`. The index links external-identifier keys and fuzzy keys to the `AcademicWorkId` already assigned, so a work keeps one identity across provider searches and across records; a deployment that needs durability persists the index itself.

```text
// First search returns a preprint and its published version:
const first = ingestWorks(createIngestIndex(), recordsFromFirstSearch)

// A later search returns another version of the same DOI:
const second = ingestWorks(first.index, recordsFromSecondSearch)
```

Each outcome reports the deduplicated works, the re-pointed versions, and an audit of what was created, merged, or flagged as suspected.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `IngestRecord` | One provider-produced `{ academicWork, workVersion }` pair. |
| `IngestIndex` | The in-memory deduplication and merge state. |
| `createIngestIndex()` | Creates an empty index. |
| `ingestWorks()` | Deduplicates a batch into the index and returns the outcome. |
| `IngestOutcome` | Updated index, deduplicated works and versions, and the audit. |
| `dedupKeys()` | Derives exact and fuzzy keys for one work. |
| `selectCanonicalVersion()` | Picks the canonical version by type and date. |
| `reconcileWork()` | Reconciles one work's records into a single `AcademicWork`. |
| `IngestAudit` / `IngestAuditEntry` | Traceable per-record decisions. |

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the retrieval or workflow consumer that renders deduplicated works into model-visible context; this library contributes no prompt or schema of its own.

#### KV Cache effect

No direct invalidation; the consumer owns record ordering and serialization into prompts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No durability** — the index is in-memory; a caller that needs persistence serializes it. The durable mapping record and merge-audit fields await a separate accepted design.
- **Fuzzy matches are only flagged** — a title/author/year collision is reported as `suspected_duplicate`, never auto-merged; within one batch, versions that share only a fuzzy key stay separate.
- **First-match exact dedup** — a record's external identifiers are checked in field order and the first collision wins; a record that would match several works by different identifiers is not split.
- **`firstPublicDate` is lexicographic** — the earliest available ISO string wins; mixed year/day precision is compared as text rather than parsed.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This pure library owns no event stream or mutable runtime data; the index is an immutable value passed in and out, and focused unit tests pin dedup, merge, and canonical-selection behavior.
