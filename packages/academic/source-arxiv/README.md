---
description: "The arXiv scholarly-source provider for the academic source seam (ctx.academicSource): searches the public Atom /api/query endpoint and normalizes each entry into the shared academic model."
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-arxiv

English | [中文](README.zh.md)

## Summary

`dsh-academic-source-arxiv` registers the `arxiv` provider with `ctx.academicSource` and searches the public arXiv Atom `/api/query` endpoint. Each entry becomes a preprint `AcademicWork`/`WorkVersion` pair: the work carries the base arXiv id and optional DOI for merging, while the version retains its `vN` record id, label, and update date.

## Table of Contents

- [Use this package](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Load the seam and this provider together; with no other provider registered, `search()` auto-selects `arxiv`.

```yaml
- name: '@deepseek-ai/dsh-academic-source'
- name: '@deepseek-ai/dsh-academic-source-arxiv'
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `https://export.arxiv.org` | arXiv export API base; `/api/query` is appended. |
| `maxAttempts` | `1` | Total attempts after connection failures; valid range `1`–`3`. |
| `retryDelayMs` | `0` | Delay before another connection attempt; maximum `30000`. |

The provider builds `GET {baseURL}/api/query?search_query=all:{query}&max_results={maxResults}`, parses the Atom feed, and maps each entry through `normalizeArxivWork()`. A failed connection can be repeated within the configured attempt bound; an HTTP response, parse failure, rate limit, or caller cancellation is never retried. `truncated` is true when the feed's `<opensearch:totalResults>` exceeds the returned entries; the seam flags its own `maxResults` cap separately. Pass an entry's id to `arxivFullTextUrls()` to obtain the preferred `/html/{id}` URL and `/pdf/{id}` fallback for `fetchAcademicFullText()`.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `ArxivProvider` | The `AcademicSourceProvider` implementation registered under id `arxiv`. |
| `ArxivProviderOptions` | The resolved endpoint for one search. |
| `parseArxivFeed()` | Parses an Atom feed body into distilled entries and the feed's `totalResults` count. |
| `normalizeArxivWork()` | Translates one arXiv entry into a work/version pair. |
| `arxivFullTextUrls()` | Derives version-specific HTML and PDF full-text URLs from an arXiv id. |
| `ArxivRawWork` | The distilled arXiv entry fields the normalizer consumes. |
| `ArxivFeedResult` | The parse result: distilled entries and the upstream `totalResults` count. |

The plugin entry also exports `name`, `inject`, `Config`, and `apply`.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the future retrieval or workflow consumer that renders the normalized works into model-visible context; this provider contributes no prompt or schema of its own.

#### KV Cache effect

No direct invalidation; the consumer owns record ordering and serialization into prompts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Network retries are bounded and opt-in** — the default sends one request; a composition may configure at most three attempts for connection failures. `429`, `5xx`, and malformed Atom responses are not retried.
- **No pagination** — arXiv caps a query at `max_results`; larger result sets need `start`-based paging.
- **Everything is a preprint** — arXiv does not expose the published version; that link arrives through the optional DOI.
- **Full-text parsing stays in the evidence package** — this source provider derives arXiv URLs but does not fetch or parse their HTML/PDF bodies.
- **`available()` is endpoint-only** — arXiv requires no key.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This provider owns no event stream or mutable runtime data beyond its resolved options; focused unit tests over a recorded Atom feed and a stubbed `fetch` pin parsing, wire mapping, query building, and error codes.
