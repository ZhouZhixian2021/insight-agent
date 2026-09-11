---
description: "The OpenAlex scholarly-source provider for the academic source seam (ctx.academicSource): searches the public /works endpoint and normalizes each record into the shared academic model."
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-openalex

English | [中文](README.zh.md)

## Summary

`dsh-academic-source-openalex` registers the `openalex` provider with `ctx.academicSource` and searches the public OpenAlex `/works` endpoint. Each returned record is normalized at the provider boundary into the shared `AcademicWork`/`WorkVersion` pair, so the seam and its future consumer never see OpenAlex-specific field names. The provider owns the HTTP request and wire mapping; the seam owns selection, cancellation forwarding, and the `maxResults` bound.

## Table of Contents

- [Use this package](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Load the seam and this provider together; with no other provider registered, `search()` auto-selects `openalex`.

```yaml
- name: '@deepseek-ai/dsh-academic-source'
- name: '@deepseek-ai/dsh-academic-source-openalex'
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `https://api.openalex.org` | OpenAlex API base; `/works` is appended. |
| `mailto` | (unset) | Polite-pool contact email sent as the `mailto` query parameter. |
| `apiKey` | (unset) | Premium-pool API key sent as the `api_key` query parameter. |

The provider builds `GET {baseURL}/works?search={query}&per-page={min(maxResults,200)}` and, when configured, `mailto` and `api_key`. Each `results[]` entry is passed through `normalizeOpenAlexWork()`. `available()` checks only that the resolved endpoint parses — the free pool needs no key.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `OpenAlexProvider` | The `AcademicSourceProvider` implementation registered under id `openalex`. |
| `OpenAlexProviderOptions` | The resolved endpoint, `mailto`, and `apiKey` for one search. |
| `OpenAlexSearchResponse` | The `/works` search response envelope this provider consumes. |
| `normalizeOpenAlexWork()` | Translates one OpenAlex record into a work/version pair. |
| `OpenAlexRawWork` | The OpenAlex `/works` field subset the normalizer consumes. |
| `NormalizedOpenAlexWork` | The work/version pair carrying shared internal ids. |

The plugin entry also exports `name`, `inject`, `Config`, and `apply`.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the future retrieval or workflow consumer that renders the normalized works into model-visible context; this provider contributes no prompt or schema of its own.

#### KV Cache effect

No direct invalidation; the consumer owns record ordering and serialization into prompts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No retries or backoff** — one request per search; a `429` or `5xx` surfaces as `ACADEMIC_SOURCE_PROVIDER_ERROR` with the HTTP status, and rate-limit/retry policy is deferred.
- **No pagination** — `per-page` is capped at the upstream `200`; result sets larger than that need a later pagination increment.
- **No run reporting** — the search request is not logged as a session event until the retrieval or workflow consumer makes it model-visible.
- **`available()` is endpoint-only** — OpenAlex's free pool requires no key, so availability does not reflect a missing `apiKey`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This provider owns no event stream or mutable runtime data beyond its resolved options; focused unit tests over recorded record shapes and a stubbed `fetch` pin the wire mapping, query building, and error codes.
