---
description: "Configure OpenAlex paper discovery, inspect version-specific full-text candidates, and diagnose incomplete coverage or unknown first-public dates."
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-openalex

English | [中文](README.zh.md)

## Summary

Search OpenAlex without downloading conference catalogs for each query. Each call sends the caller's unchanged query once and returns normalized bibliography and version-matched full-text candidates. Discovery does not guarantee a downloadable full text or a verified first-public date. The workflow remains responsible for query planning, date eligibility, and evidence quality.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The composition must make this plugin resolvable and mount the [source service](../source/README.md). The YAML loader composition is exercised by the package test; installation in the Web profile is an integration-owner step, not performed by this package.

```yaml
- name: '@deepseek-ai/dsh-academic-source'
  config:
    searchProviders: [openalex]
    searchTimeoutMs: 25000
- name: '@deepseek-ai/dsh-academic-source-openalex'
  config:
    maxResults: 5
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `https://api.openalex.org` | Trusted HTTPS API endpoint; no URL credentials, query, or fragment |
| `apiKeyEnv` | `OPENALEX_API_KEY` | Optional environment variable containing a Bearer API key |
| `searchMode` | `keyword` | `keyword` or explicitly selected `semantic`; no automatic fallback |
| `publicationYears` | unset | Optional `YYYY-YYYY` publication-year filter, not a first-public filter |
| `timeoutMs` | `20000` | Request and response-body deadline in milliseconds |
| `maxResults` | `50` | Per-request ceiling, at most 100 for keyword and 50 for semantic search |
| `maxCachedRecords` | `1000` | Full-text location cache capacity, at least `maxResults` |

Existing ACL, CVF, PMLR, and arXiv providers can remain mounted. Providers outside `searchProviders` are not queried and do not appear in the called-provider list. OpenAlex records use this provider's own URL resolver; an OpenAlex ID is not an ACL or PMLR ID. ACL DOIs and recognized official landing pages can produce direct PDF candidates without another search. The existing full-text fetcher still enforces download safety and handles candidate failure.

### Failures and date filtering

Validated arXiv links contribute work-level identifiers so existing ingestion can merge an already-retrieved arXiv record and its first-public date. This does not fetch missing metadata automatically or assign the preprint identifier/URL to a published version. Publication venues come from published locations, not repository hosting names; conference ranking and exact revision remain unverified. `searchAll()` reports counts of unknown dates, venues, version types, and missing or failed full-text resolution in its existing `limitations` field.

The provider distinguishes cancellation, timeout, rate limit, malformed JSON/metadata, network failure, and other HTTP errors. `searchAll()` records source failures without discarding other sources. A date filter can exclude an old paper when OpenAlex's merged record uses a later publication date; leave it unset when discovery must not exclude such records, then verify eligibility against authoritative metadata. All `firstPublicDate` values remain unknown rather than treating aggregate dates as verified first-public dates.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[Normalization](src/normalize.ts) validates the upstream response and avoids substituting preprint URLs for published-version content. [The provider](src/provider.ts) retains URL candidates in a bounded instance-local map. There is no independent observable relationship requiring an invariant companion. Unit tests cover mapping and cancellation; the YAML loader test covers composition and a result snapshot. The opt-in `ACADEMIC_OPENALEX_LIVE=1` e2e records the fixed long queries and checks a separately identified BERT title/full-text control; it does not certify fixed-query recall or a research report.

</details>

<a id="model-experience"></a>
## Model Experience

### Workflow-owned scholarly context

#### What the model sees

The workflow can render `academicWork`, `workVersion`, and source `limitations` from normalized results. This plugin adds no model tool or prompt and does not own that rendering.

#### Token effect

No direct token use; the workflow selects which discovered records enter model context.

#### KV Cache effect

No direct effect; the consuming workflow owns prompt construction.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Incomplete discovery** — index coverage and ranking may omit required papers; the provider performs no planning, pagination, or retries. Semantic search availability is upstream-dependent.
- **Unverified chronology** — publication dates can reflect merged later records. Strict `first_public_release` selection requires another authoritative source.
- **Incomplete full text** — missing URLs stay missing; no generic DOI redirect traversal or automatic official-site search is implemented. Download and semantic evidence extraction can still fail.
- **Ephemeral URL cache** — restart or eviction requires discovery again; URLs are not persisted in the public work model. Concurrent workloads beyond the configured capacity need workflow-owned durable resolution.

<a id="dev-note"></a>
### Dev Note

The Web profile, root package paths/references, lockfile, and session/report acceptance remain integration-owner work. This package does not assert that the fixed two-query Transformer/BERT acceptance has passed.
