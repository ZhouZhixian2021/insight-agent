---
description: "The Crossref scholarly-source provider for the academic source seam (ctx.academicSource): searches the public /works endpoint and normalizes each record into the shared academic model."
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-crossref

English | [中文](README.zh.md)

## Summary

`dsh-academic-source-crossref` registers the `crossref` provider with `ctx.academicSource` and searches the public Crossref `/works` endpoint. Each returned record is normalized at the provider boundary into the shared `AcademicWork`/`WorkVersion` pair, carrying a lowercase-bare DOI as its external identifier so ingestion can merge it with OpenAlex and arXiv records of the same work.

## Table of Contents

- [Use this package](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Load the seam and this provider together; with no other provider registered, `search()` auto-selects `crossref`.

```yaml
- name: '@deepseek-ai/dsh-academic-source'
- name: '@deepseek-ai/dsh-academic-source-crossref'
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `https://api.crossref.org` | Crossref API base; `/works` is appended. |
| `mailto` | (unset) | Polite-pool contact email sent as the `mailto` query parameter. |

The provider builds `GET {baseURL}/works?query={query}&rows={maxResults}` and, when configured, `mailto`. Each `message.items[]` entry is passed through `normalizeCrossrefWork()`.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `CrossrefProvider` | The `AcademicSourceProvider` implementation registered under id `crossref`. |
| `CrossrefProviderOptions` | The resolved endpoint and `mailto` for one search. |
| `normalizeCrossrefWork()` | Translates one Crossref record into a work/version pair. |
| `CrossrefRawWork` | The Crossref `/works` field subset the normalizer consumes. |
| `CrossrefSearchResponse` | The `/works` search response envelope. |

The plugin entry also exports `name`, `inject`, `Config`, and `apply`.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the future retrieval or workflow consumer that renders the normalized works into model-visible context; this provider contributes no prompt or schema of its own.

#### KV Cache effect

No direct invalidation; the consumer owns record ordering and serialization into prompts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No retries or backoff** — one request per search; a `429` or `5xx` surfaces as `ACADEMIC_SOURCE_PROVIDER_ERROR`.
- **No retraction detection** — Crossref exposes retractions through `update-to` links, which this provider does not resolve.
- **`available()` is endpoint-only** — Crossref's free pool requires no key.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This provider owns no event stream or mutable runtime data beyond its resolved options; focused unit tests over recorded record shapes and a stubbed `fetch` pin the wire mapping, query building, and error codes.
