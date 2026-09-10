---
description: "OpenAlex record translation into the shared academic model."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-source-openalex

English | [中文](README.zh.md)

## Summary

`dsh-academic-source-openalex` translates OpenAlex `/works` records into the shared records of `dsh-academic-model`. It is a library, not a Cordis service or plugin, and performs no network requests, retrieval runs, evidence extraction, or model calls.

## Table of Contents

- [Use this package](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Academic ingestion calls `normalizeOpenAlexWork()` on each captured OpenAlex record and feeds the returned `AcademicWork`/`WorkVersion` pair into deduplication and version merging. OpenAlex-specific field names stay inside this package; callers receive only shared-model records.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `OpenAlexRawWork` | OpenAlex `/works` field subset this adapter consumes. |
| `normalizeOpenAlexWork()` | Translates one record into one work with a single immutable version. |
| `NormalizedOpenAlexWork` | The work/version pair carrying shared internal ids. |

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through workflow and analysis consumers that render the normalized records into model-visible context.

#### KV Cache effect

No direct invalidation; consumers own record ordering and serialization into prompts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No network client** — the package translates captured records; fetching, rate-limit handling, and retries arrive with the retrieval increment.
- **No retrieval-run reporting** — `RetrievalRun`, `CoverageSummary`, and `ProviderFailure` are not yet published by the shared model, so this adapter records no run statistics yet.
- **Single-record translation** — each record becomes one new work identity; cross-record version linking and deduplication live in the ingestion increment.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This pure library owns no event stream or mutable runtime data; focused unit tests over captured record shapes verify its translations.
