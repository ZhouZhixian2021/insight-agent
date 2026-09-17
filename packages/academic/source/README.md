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

Both search methods return normalized works and enforce the total `request.maxResults` bound. `resolveFullText()` maps a selected version's source record back to its provider-owned ordered URL candidates. Calls accept an optional `AbortSignal` forwarded to providers.

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

Failures throw `AcademicSourceError` with a stable, machine-routable code; the message adds detail such as the missing provider id or the ambiguous candidate set. Callers route on the code and decide how to degrade.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `AcademicSourceProvider` | Backend contract: availability, search, and source-specific full-text URL resolution. |
| `AcademicSourceSearchRequest` | One scholarly query with an optional `maxResults` bound. |
| `AcademicSourceSearchResult` | Normalized work/version pairs plus a `truncated` flag. |
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
- **No retrieval-run reporting** — `RetrievalRun`, `CoverageSummary`, `ProviderFailure`, and `BatchResult` are not yet published by the shared model, so this seam records no run statistics and surfaces failure only through `AcademicSourceError`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This service owns no event stream or mutable data beyond its private provider map, and selection/caps are enforced on each call. Focused unit tests over scripted providers pin registration, selection, truncation, and the error codes.
