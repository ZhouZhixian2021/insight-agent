# Agent Note: Academic source and ingestion publish progress facts from their own packages

Status: implemented

English | [中文](2026-09-28-academic-source-ingestion-progress-facts.zh.md)

## Problem

The Academic research progress format carries per-provider retrieval activity and ingestion counts, but the owning packages exposed neither. A source round reported only its settled aggregate, so a client could not tell which provider was running, which one failed, or why. Ingestion reported an internal audit that no progress consumer could read without re-deriving its meaning. The workflow could not produce these facts itself: discovery fan-out and dedup decisions live in the source and ingestion packages.

## Decision

`dsh-academic-source` adds an optional per-provider observer to `searchAll()` and `searchProviders()`. It publishes a `started` observation at the moment each provider's request actually begins, before the round await is joined, and a `settled` observation carrying the provider's `success`, `failed`, or `cancelled` settlement, its shared failure `category` when failed, the works it returned, and its truncation flag. Observations carry no timestamp; the progress owner stamps them. Observer exceptions are swallowed, because progress is observational and must not change the round's results.

`dsh-academic-ingestion` adds `summarizeIngestAudit()`, which aggregates one `IngestOutcome` into four counters that never share a meaning: `mergedWorkIdentities` from `merged_work`, `mergedVersionRecords` from `merged_version`, `suspectedDuplicateRecords` from `suspected_duplicate`, and `retainedWorkVersions` as the outcome's distinct retained version total (`outcome.versions.length`), never a `merged_version` count.

The business boundaries stay unchanged. `EvidenceGenerator` keeps its `(request) => Promise<EvidenceDraft[]>` signature: model batch and attempt facts remain the workflow's, produced by its batching and model-call code. Web discovery identification and per-reference verification live facts belong to the hybrid-retrieval orchestration that calls the pure identifier and `verifyReference()`; their return values carry terminal state only, and the orchestrator publishes start and terminal facts.

## Alternatives considered

**Extend `EvidenceGenerator` with a progress callback.** Rejected because the batch index, attempt count, and timeout happen inside the workflow's batching and model-call layers; the evidence library only sees the generator's final per-paper response, so a callback there would report facts its package cannot observe.

**Report a provider settlement only after `Promise.all()` returns.** Rejected because a client could not show a provider as running, and a slow provider's start would be invisible for the whole round.

**Fold ingestion facts into fewer counters.** Rejected because merged identities, merged version records, suspected duplicates, and the retained version total describe different decisions; one counter would misstate at least one of them.

**Have the progress protocol own the provider observation type.** Rejected because the facts originate in the source package; the source package owns their vocabulary and the workflow maps them into the progress format.

## Consequences

The workflow and its progress projection can show each academic provider's running and terminal state and the ingestion dedup counters without reaching into source or ingestion internals. The source package gains one optional parameter and one isolated observer path; omission preserves every existing call and result. The ingestion function is pure and reads only the audit and versions it is given. Full-round aggregation, the `partial_success` verdict, and user-facing text remain the workflow and client owners' work.
