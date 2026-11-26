---
description: "Discover and verify product pages from an approved investigation plan while retaining partial outcomes."
kind: "package-library"
---

# @deepseek-ai/dsh-product-insight-source

English | [中文](README.zh.md)

## Summary

Use this library to turn an approved product plan into candidate pages, acquire their complete text, and verify exact excerpts. It runs the approved search intents after approval, pools and screens their URLs alongside feeds, retains successful work when another search or fetch fails, and offers explicit additional searches to programmatic callers. The product preset supplies public search and page providers. Search snippets help discover pages but never become evidence; callers own persistence and model use.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

After approval, `discoverCandidatePages()` collects the official address, available feeds and web results with their titles and snippets. The public workflow collects up to 60 links per query or feed and applies the plan’s separate reading allowance after screening all returned leads. A failed source leaves other sources available. `fetchProductPages()` reads up to eight selected pages concurrently and saves the complete canonical text before publishing its snapshot. Without an explicit plan character bound, cleaned HTML and PDF text are not rejected at 12000/48000 characters, 16 MiB or 200 pages. Legacy explicit character bounds remain enforceable. `splitProductPageText()` remains a legacy fixed-window helper; new unbounded-plan execution uses model context capacity in the workflow. Excerpts are verified against complete saved text with physical PDF page numbers. Transport resource protection remains configurable: default response 64 MiB and body 16,777,216 characters; exceeding transport capacity is recorded, never silently treated as complete. Browser request and timeout protections remain.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

Each approved question can carry separate queries in `searchQueries`. Identical queries shared by several questions run once. Earlier plans still use their original `searchTerms` or the question-derived query.

[Discovery](src/index.ts) records each query outcome. The [candidate pool](src/candidate-pool.ts) combines metadata by destination, removes login and redundant index pages, and ranks eligible pages for each topic. Questions take turns choosing a page. Within a question, a product page whose title, snippet or URL path names material missing from the reading list gets priority. Shared query words and the query that returned a URL cannot establish this match. A page can represent several material needs. Remaining slots follow the relevance ranking without per-material quotas. Product-wide material can compete without being marked as covering all questions. Excluded URLs may occupy remaining diagnostic positions and are never fetched. Explicit programmatic gap searches keep their approved limits and can replace an excluded candidate. Promoted result containers keep the organic markup, so [search parsing](src/multi-search.ts) drops Bing and Yahoo ad slots by container class before reading any card. An engine that fails its threshold in a row is skipped for a configured cooldown, and the full rotation is used again when every engine is cooling so a run never loses its only source. Search snippets and generated answers are never evidence. [Page preparation](src/page-content.ts) rejects partial and unsupported bodies, saves normalized text under a SHA-256 identity, partitions long text without changing its offsets, ranks windows across approved questions for first-pass extraction, captures bounded HTML publisher, publication, update, region and version declarations, and verifies each proposed excerpt against the complete saved content. Absent or malformed declarations stay unknown. Ambiguous repeated excerpts require an exact offset. [Acquisition](src/page-fetch.ts) fetches up to eight selected pages at a time within the approved candidate batch. A page answered with 403, 405, 429 or 503, or with a response that carries no usable content type, is retried once with a browser-like agent through the same guarded transport. A retry that stays blocked keeps the original status, and a retry that still has no usable body surfaces the original failure. Each completed capture saves its text and frees a slot for the next page. The returned snapshots, failures and image occurrences follow candidate order. For full-page review, HTML table cells are kept together in their row. Revalidation also recognizes the exact text layout of earlier snapshots. Cancellation stops dispatch and waits for active fetches before returning. For complete text PDFs, acquisition uses PDF.js and stores page breaks in the canonical text. Verified excerpts retain exact offsets and the physical page number. Explicit PDF publisher, product version, region and source dates pass through the same checks as HTML declarations. When the initial HTML text exceeds the approved bound, acquisition reads the complete article or main region in document order and skips navigation, hidden elements, and media controls. For oversized Markdown returned as text, it removes inline link and image destinations while preserving their visible labels. If converted text still exceeds the bound, an optional raw fetch can read the same approved URL once. Acquisition saves the resulting canonical text only if it fits and verifies excerpt offsets against that exact saved string. Pages that still exceed the bound fail; `sameProductPageFacts()` compares a fresh fetch with saved content and declared scope while ignoring observation identity and time.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Product insight model](../model/README.md) defines the plan, candidate, and batch records.
- [DSH Web](../../web/web/README.md) supplies interchangeable search providers.

-----

<a id="model-experience"></a>
## Model Experience

None, as this library returns caller-owned source records and verified excerpts without rendering model-visible text.

#### KV Cache effect

The workflow may send fetched page text to a model, but this library itself does not construct a model request.

## Known Limitations and Deferred Work

- **Document extraction limits** — PDF acquisition requires an extractable text layer and accepts at most 16 MiB and 200 physical pages within the approved character limit. HTML normalization handles common semantic tags and entities; pages with complex rendered layouts need a browser or DOM extraction adapter. A page beyond its approved text bound fails acquisition. Without overlap, an excerpt crossing a model-window edge may be missed; the product workflow uses 1,499 characters of repeated context for excerpts of at most 1,500 characters.
- **Caller-owned orchestration** — The caller persists source text and records, supplies proposed excerpts, and logs any model request. A consumer must verify nonofficial publisher ownership before treating a different site as an independent publisher. This package does not run the product workflow or produce a report.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The page acquisition and excerpt verification functions implement C's source-package handoff. Product workflow and report consumers still need to call them.

</details>

Focus plans screen the title, snippets and URL path for product or topic signals. A specific approved official page, an official or requested site with sparse metadata, or a topical page on such a site can be inspected. Legacy plans keep their source allowlist.

Historical planning links enter the same pool as new results. Matching URLs are combined across feeds and web queries, including recognized Bing News publisher redirects. Locale paths and content-bearing query parameters remain distinct.

Search results also return site navigation, which discovery excludes before acquisition. Account, cart and search pages are excluded on any host. A site root, a bare locale prefix or a store index is excluded only when the same host contributes a deeper page, so a product whose home page is its only page keeps that page. A store path below its index — one configuration, for example — is kept, as is a support article below a support host. Entry points are considered last when candidate slots are assigned, so a content page takes the slot an entry point would otherwise occupy.
