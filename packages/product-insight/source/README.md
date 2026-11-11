---
description: "Discover and verify product pages from an approved investigation plan while retaining partial outcomes."
kind: "package-library"
---

# @deepseek-ai/dsh-product-insight-source

English | [中文](README.zh.md)

## Summary

Use this library to discover approved product pages, acquire bounded source text, and verify exact evidence positions. It retains successful queries and fetches when another fails; the workflow owns model selection, persistence and reporting.

An isolated product Web registry offers multi-engine free search and public-page fetching. Search snippets remain discovery material and cannot become evidence.

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

`discoverCandidatePages()` screens approved source domains before acquisition, merges duplicate URLs and retains per-query failures. Search requests and the retained candidate bound are separate. `fetchProductPages()` reads up to three selected pages concurrently and saves the complete canonical text before publishing its snapshot. The approved page limit is 12,000–48,000 characters; absent an explicit limit, the default remains 12,000. Oversized pages may be reduced to their article text, but pages still exceeding the limit fail acquisition. `splitProductPageText()` remains available for legacy checkpoints. Excerpts are verified against complete saved text with physical PDF page numbers. Transport resource protection remains configurable: default response 64 MiB and body 16,777,216 characters; exceeding transport capacity is recorded, never silently treated as complete. Browser request and timeout protections remain.

The free search provider queries DuckDuckGo, Bing and Yahoo concurrently, interleaves ranked links, removes tracking parameters, and records each engine's outcome. It treats captchas and unknown layouts as failures. Page retrieval uses bounded HTTP with a browser fallback for empty or JavaScript-dependent pages. The browser allows public GET requests only; login and interactive pages remain outside this acquisition path.

For new investigations, `indexProductPagePassages()` marks exact sentence-sized source ranges and nearby context without rewriting the saved text. `keywordProductPassageRetriever` ranks them per approved question and presents at most six, including neighbors; `ProductPassageRetriever` is the extension point for later semantic retrieval. The model returns passage IDs. `extractProductPassageEvidence()` checks the snapshot hash, selected IDs and question links, then copies one to three exact excerpts from saved text into version 2 evidence. Legacy fragment extraction remains available for old checkpoints. `evaluateProductPassageRetrieval()` accepts manually checked saved-text ranges and reports retrieval recall; an empty sample set returns no recall result.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

When follow-up searches are approved, initial review-needed candidates leave one slot per approved follow-up, up to the page limit. An approved publisher result can enter bounded page inspection when its search metadata names the leading Latin brand even if the product plan uses a longer descriptive name. The fetched page must still pass source and excerpt checks.

[The public entry](src/index.ts) issues searches sequentially so one provider failure cannot discard a settled query. Discovery screens returned results before assigning candidate slots. It considers selected pages first, review-needed pages next, and excluded pages last. Initial discovery alternates approved questions within each group in provider rank order. At the candidate-page limit, additional unique pages mark their query as truncated, and previously admitted URLs still acquire links to all matching questions. It removes URL fragments and known tracking parameters for deduplication while preserving content-bearing query parameters. A gap query combines the product name, the distinctive terms of the approved question, and any approved version and region. It targets the approved host with the fewest previously selected pages that did not fail acquisition and accepts results from that host. An untried host wins a tie. A selected follow-up can replace an unselected candidate in a full pool or promote the same URL without refetching previously selected pages. Pages on the approved official host are selected for bounded inspection. Other pages are selected when search metadata names the product, and carry an approved publisher name when their host matches that publisher. Remaining valid pages need review. Search snippets and generated answers are never evidence. [Page preparation](src/page-content.ts) rejects partial and unsupported bodies, saves normalized text under a SHA-256 identity, partitions long text without changing its offsets, ranks windows across approved questions for first-pass extraction, captures bounded HTML publisher, publication, update, region and version declarations, and verifies each proposed excerpt against the complete saved content. Absent or malformed declarations stay unknown. Ambiguous repeated excerpts require an exact offset. [Acquisition](src/page-fetch.ts) fetches up to three selected pages at a time within the approved candidate batch. It saves text and records available or failed snapshots in candidate order. Cancellation stops dispatch and waits for active fetches before returning. For complete text PDFs, acquisition uses PDF.js and stores page breaks in the canonical text. Verified excerpts retain exact offsets and the physical page number. Explicit PDF publisher, product version, region and source dates pass through the same checks as HTML declarations. When the initial HTML text exceeds the approved bound, acquisition reads the complete article or main region in document order and skips navigation, hidden elements, and media controls. For oversized Markdown returned as text, it removes inline link and image destinations while preserving their visible labels. If converted text still exceeds the bound, an optional raw fetch can read the same approved URL once. Acquisition saves the resulting canonical text only if it fits and verifies excerpt offsets against that exact saved string. Pages that still exceed the bound fail; `sameProductPageFacts()` compares a fresh fetch with saved content and declared scope while ignoring observation identity and time.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Product insight model](../model/README.md) defines the plan, candidate, and batch records.
- [DSH Web](../../web/web/README.md) supplies interchangeable search providers.

-----

<a id="model-experience"></a>
## Model Experience

None, as this library contributes source data and Web providers without adding model context or dispatching model requests.

#### KV Cache effect

The workflow may use a separate model call to recognize observed links when ordinary search parsing fails; this library does not add conversation replay.

## Known Limitations and Deferred Work

- **Document extraction limits** — PDF acquisition requires an extractable text layer and accepts at most 16 MiB and 200 physical pages within the approved character limit. HTML normalization handles common semantic tags and entities; pages with complex rendered layouts need a browser or DOM extraction adapter. A page beyond its approved text bound fails acquisition. Without overlap, an excerpt crossing a model-window edge may be missed; legacy fragment resumes use 1,499 characters of repeated context for excerpts of at most 1,500 characters.
- **Caller-owned orchestration** — The caller persists source text and records, supplies proposed excerpts, and logs any model request. A consumer must verify nonofficial publisher ownership before treating a different site as an independent publisher. This package does not run the product workflow or produce a report.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The page acquisition and excerpt verification functions implement C's source-package handoff. Product workflow and report consumers still need to call them.

</details>
