---
description: "The academic source access service (ctx.academicSource): how workflows and future tools search scholarly works through interchangeable providers, with one selection policy and error vocabulary."
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source

English | [中文](README.zh.md)

## Summary

Any academic package can search scholarly providers through `dsh-academic-source` (`ctx.academicSource`) without binding to a vendor's API. Callers can select one provider with `search()` or aggregate every usable provider with `searchAll()`, then resolve ordered full-text candidates from the selected version. The service itself makes no network calls and registers no model-facing tool; providers own transport and source-specific parsing.

## Table of Contents

- [Use this package](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

A composition that needs scholarly search loads the service and at least one provider. Call `search()` for an explicitly selected backend or `searchAll()` for round-robin aggregation across every usable provider.

Load the service and pin a provider with `searchProvider`, or let a single mounted backend auto-select. The environment variable `$DSH_ACADEMIC_SOURCE_SEARCH_PROVIDER` feeds the same field and is not a separate priority chain.

```yaml
- name: '@deepseek-ai/dsh-academic-source'
```

| Field | Default | Meaning |
|---|---|---|
| `searchProvider` | (unset) | Pinned search provider id; unset auto-selects when exactly one is usable |
| `searchProviders` | (unset) | Non-empty discovery provider ids for `searchAll()`; unset calls every usable provider |
| `searchTimeoutMs` | (unset) | Positive per-provider deadline; unset leaves the budget to the caller |

Set `searchProviders: [openalex]` to avoid catalog downloads during discovery while retaining mounted catalog providers for `resolveFullText()`. This list does not map OpenAlex identifiers to other providers' identifiers. Missing or unavailable configured providers fail explicitly. Set `searchTimeoutMs` to isolate a hanging provider: the service aborts its child signal, records a `timeout` failure, and preserves other results. Caller cancellation still aborts the round. Providers must cooperate with cancellation to release their underlying resources; the service can stop waiting but cannot terminate arbitrary provider code.

Both search methods return normalized works and enforce the total `request.maxResults` bound. `searchAll()` aggregates every usable provider into one batch: a single provider's failure keeps the other providers' works in `batch.items` and records the failure in `batch.failures`, while `providers`, `discoveredRecords`, `truncated`, and `limitations` report the called providers, the pre-bound record count, dropped-record state, and source coverage limits. `resolveFullText()` maps a selected version's source record back to its provider-owned ordered URL candidates. Calls accept an optional `AbortSignal` forwarded to providers.

### Provider selection

Each call resolves its provider at execution time, and registration or load order never matters. A configured provider id wins when it is registered and usable; without a configured id, the service runs the single usable provider or fails clearly:

| Situation | Outcome |
|---|---|
| configured id registered and usable | runs that provider |
| configured id not registered | `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING` |
| configured id registered but unavailable | `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE` |
| no id, exactly one registered usable provider | runs it |
| no id, no usable provider | `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE` |
| no id, multiple usable providers | `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS` |

A provider's availability is a cheap local check — for example whether its key or endpoint is present — and never makes network calls, so selection stays fast and deterministic.

### Failures and recovery

For retained works with source records, `searchAll()` also reports counts of unknown first-public dates, venues, and version types, plus missing or failed full-text candidate resolution, in `limitations`. These are discovery limits, not download attempts or source-search failures; they do not fabricate `batch.failures` or discard successful search results. No candidates does not establish that a paper has no full text.

`search()` failures throw `AcademicSourceError` with a stable, machine-routable code. `searchAll()` converts expected search failures into source-level `ProviderFailure` entries and keeps surviving works. Timeout, rate-limit, network, and parsing codes have distinct categories; other expected codes use `upstream_error`. Selection/configuration errors still throw, and caller cancellation aborts the round as `ACADEMIC_SOURCE_ABORTED`. The service performs no retries or query planning.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `AcademicSourceProvider` | Backend contract: availability, search, source-specific full-text URL resolution, and optional declared coverage limitations. |
| `AcademicSourceSearchRequest` | One scholarly query with an optional `maxResults` bound. |
| `AcademicSourceSearchResult` | Normalized work/version pairs plus a `truncated` flag. |
| `AcademicSourceSearchBatchResult` | `searchAll()` aggregate: called providers, pre-bound record count, the `BatchResult` of works and source failures, truncation, and coverage limitations. |
| `AcademicSourceWork` | One provider-neutral `{ academicWork, workVersion }` pair. |
| `AcademicSourceError` | Typed failure carrying a stable, open-string `code`. |
| `AcademicSourceRuntime` | Registration, single/all-source search, and full-text resolution. |

The exhaustive signatures live in the [academic source subsystem](../../../docs/subsystems/academic-source.md) reference.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the workflow or retrieval consumer that will render normalized works into model-visible context; this service contributes no prompt or schema of its own.

#### KV Cache effect

No direct invalidation; the consumer owns record ordering and serialization into prompts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No network client** — the service selects and bounds providers; fetching, rate-limit handling, and retries belong to each provider implementation.
- **Search requests carry only `query` and `maxResults`** — provider-neutral filters (`publicationWindow`, work types) are deferred until backends and a driven consumer can honor them honestly.
- **No fetch-by-identifier operation** — resolving a single work by DOI or provider id is a separate future operation, not a widening of `search()`.
- **No retrieval-run reporting** — `searchAll()` publishes batch facts (`providers`, `discoveredRecords`, `BatchResult`, `limitations`), but constructing `RetrievalRun` and `CoverageSummary` stays with the workflow consumer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This service owns no event stream or mutable data beyond its private provider map, and selection/caps are enforced on each call. Focused unit tests over scripted providers pin registration, selection, truncation, and the error codes.
