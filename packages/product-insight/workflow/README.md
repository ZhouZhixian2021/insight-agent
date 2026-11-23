---
description: "Run an approved product investigation and evaluate cited report delivery."
kind: "package-reference"
---

# @deepseek-ai/dsh-product-insight-workflow

Incomplete model responses now record their finish kind. Missing independent support is disclosed without extra comparison calls or searches; original-source eligibility still applies. The delivery-reason list omits duplicate unanswered-claim checks and keeps the general cross-site limitation in report limitations.

English | [中文](README.zh.md)

Missing or mismatched page publisher declarations are disclosed per question, without rejecting evidence from an approved domain. Historical uncertain or conflicting comparisons are also disclosures: source-supported statements remain available to synthesis with their differing conditions. Original-source support, citation integrity, freshness, approved domains and explicit scope checks remain enforced.

## Summary

After plan approval, the product workflow captures pages, writes one connected summary per page, reviews each summary against its complete source, and delivers a cited report. Session checkpoints retain completed page reviews for recovery.

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

Report coverage identifies research questions requiring a follow-up investigation. A missing answer or a failed page review is disclosed alongside the usable material.

Read the latest explicitly approved native or PTC plan result from durable Session events with `latestApprovedProductPlan()`, then use `productPlanFromApproval()` to reconstruct the exact identity and reviewed plan. Parsing alone does not approve execution. The structured block accepts version 1, the legacy publisher allowlist that historical plans keep using, and version 2, which requires `focus` with the directions the user confirmed from the fixed vocabulary plus any custom wording. Version 2 rejects `sourcePublishers` and accepts `additionalSites` only as sites the user named. New plans allow up to 30 candidate pages and omit elapsed-time and canonical-page character limits. Explicit limits in historical plans remain enforced.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

The [full-page reader and reviewer](src/page-summary.ts) share the captured source metadata and text. Each request pair belongs to one page version. Review accounts for every numbered paragraph and returns replacements, reasons and one or more exact source passages for edits. A replacement may draw on a heading, table and footnote together. A paragraph with no supported content may be removed. One malformed review can be corrected against the same draft. A failed review excludes that page from writing.

For legacy excerpt checkpoints, the original workflow applies. [The approval handoff](src/approved-plan.ts) finds an explicit approval in Session events and validates the structured block; parsing a proposed plan alone never grants approval. [The runner](src/index.ts) rechecks approval, discovers candidates, fetches selected pages, uses complete saved text for new plans and retains bounded overlapping windows for historical plans with explicit page limits, verifies proposals at their full-page offsets, suppresses identical proposals from adjacent windows, and checkpoints accepted evidence after each fragment before review. A transport failure or per-request timeout can retry the same window once after 500 milliseconds. An eligible model-output failure can split a window once into two smaller overlapping ranges. Each window uses one recovery path within the approved elapsed time. Cancellation ends a pending retry and records active elapsed time at the existing checkpoint cursor. Successful children preserve their evidence; an unrecovered range is disclosed; valid remaining material can still be delivered. Legacy windowed runs rank each page's first-pass windows by matches to approved questions. Questions with no verified excerpt take the first turn, and unmatched windows follow in source order. Version 3 checkpoints record the dispatch order for an unfinished page. Versions 1 and 2 resume in source order with their original window layouts. [The review decision](src/claim-review.ts) requires one judgment per excerpt and admits a source-bound claim only for an explicit `supported` verdict. A failed review batch may split once into two smaller batches; valid half-batch judgments and claims are retained, while an unrecovered half leaves delivery as a draft. The runner proceeds from original-source support review directly to synthesis; unanswered questions remain available for a new user-approved investigation. It does not invoke independent comparison or search for corroboration; historical comparisons remain readable on resume. [Report evaluation](src/report.ts) requires eligible sources, valid citations, current source hashes, and no conflicting or uncertain comparison. Failed operations, limited searches, unanswered questions, and missing independent corroboration are disclosures rather than standalone draft reasons. It also renders actual query outcomes, candidate and fetch counts, and truncation without promoting search metadata to evidence or exposing provider error text. External sources require a user-approved publisher domain and matching page declaration. Explicit region, version, and date criteria must match captured declarations; missing values remain unknown. A report with evidence but unmet checks remains a cited draft.

The [Session tool](src/session-tool.ts) records the model route, complete requests, responses and page identity. Checkpoints pin reviewed paragraphs to a saved snapshot and hash. Explicit resume verifies stored canonical text and reuses exact completed model responses. Current source changes are disclosed when the report relies on a saved snapshot. Versions 1–3 continue excerpt processing. Version 4 continues page summaries.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Product insight model](../model/README.md) defines approved plans, evidence, runs, and report delivery.
- [Product source](../source/README.md) owns Web acquisition and exact excerpt verification.

-----

<a id="model-experience"></a>
## Model Experience

### Search recognition

#### What the model sees

When ordinary search parsing fails, the current session model receives a bounded rendered search-page observation and selects only displayed link IDs through `product/search-recognize`. Search snippets and selected links remain discovery material, never evidence.

#### Token effect

Each recognition request has at most 1,024 output tokens per engine. A failed or uncheckpointed discovery can repeat recognition; ordinary parsed results need no recognition request.

#### KV Cache effect

Recognition is a separate model request using the selected route and does not replay the conversation.

### Product evidence extraction and writing

#### What the model sees

For each source the reader receives its title, URL, observed metadata, the complete captured text, scope and all research questions. A separate request checks every draft paragraph, including ordinary descriptions, attribution, qualifications and material omissions. The writer receives the corrected summaries with page-level citation IDs and image observations. Source texts and review drafts remain in the Session.

#### Token effect

Reading and review each send the full page. Summary length follows the material within the selected model’s capacity. A whole input that exceeds context is reported for that page. The [report handler](src/insight-output.ts) sends the summary pool once per writing request, keeps accepted sections during repairs and renders sentence-level source citations.

#### KV Cache effect

Three page tasks can run concurrently. Each task reads then reviews one page. As soon as one task finishes, another page may start. Checkpoints advance in capture order. Exact saved inputs, model settings, phase and request sequence identify responses that can be reused on resume.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Process-local jobs** — The task continues after its starting tool call ends while the owning Agent remains active. After a process restart, the live job is gone and its saved task record is reported as interrupted. A new explicit call can resume committed work for the same approved plan. An uncommitted model response may need another call; automatic continuation and an independent progress page are not implemented.
- **Revalidation scope** — Resumption re-fetches selected URLs but retains saved snapshots, evidence and reviews even when a source changes or cannot be fetched. Reports disclose that they describe captured content, not necessarily the current page. Cancellation still interrupts resumption.
- **Source limitations** — A focus plan no longer ties source eligibility to a registered domain: pages outside the official site are read and cited without an automatic unregistered-site notice. Missing independent corroboration also produces no boilerplate notice; synthesis explains concrete limitations from the material itself. For legacy plans, domain approval, region, version, date and snapshot mismatches remain report disclosures rather than standalone draft reasons. Discovery still screens candidates before fetching. Statements without semantic support or a matching saved snapshot do not enter confirmed prose; a report with no supported statements explicitly leaves questions unanswered. No evidence still blocks report creation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The caller must persist run events and model requests so a resumed investigation can reconstruct its decisions.

</details>

Product mode owns its job controller and does not mount the generic job-completion notifier. New approved plans start after the planning turn becomes idle; rejected or dismissed plans do not start. Restart the service and open a new product session to test the updated preset. Historical saved reports remain readable; unfinished historical plans are not silently restarted.

On legacy excerpt checkpoints, review judgments are admitted individually; missing or invalid judgments do not discard valid siblings or independently block delivery. Missing records are disclosed per question. Reviews may associate evidence with another approved question while preserving extraction-time associations. Synthesis places evidence markers after supported sentences; validated references become numbered footnotes and clickable superscripts in chat and HTML. Existing paragraph-end citations are not relocated automatically; regenerate those reports.

The approved Session entry point carries successful structured web-search results from the same planning turn into discovery. It excludes earlier turns, failed calls and results after the plan call. Existing checkpoints retain their saved candidate pool; newly started investigations use the handoff. Assistant-written links are not treated as observed search results.

On legacy excerpt checkpoints, full-page extraction processes up to three pages concurrently. Each completed page frees its slot immediately, even if an earlier page still runs. Results and checkpoints commit in source order. Retries occupy the current page slot. Cancellation stops new dispatch and waits for outstanding requests. Historical plans with explicit page character limits retain sequential fragment extraction. On restart, uncommitted look-ahead pages are revisited; the Session adapter reuses matching completed model responses when available.

Original image reading runs in three rolling slots. Matching image bytes, format, caption and surrounding text share a model reading within the investigation, while each occurrence keeps its source page. When image materials are available, every section chooses inline citations alone or selects original images and the prose paragraphs they follow. A placement repair preserves accepted text. Comparable measurements or configurations can use cited tables. The saved report embeds selected originals for offline HTML.

Starting-price comparisons identify the market and currency for each configuration. Regular and documented education-discount starting prices have separate columns and source citations. Undisclosed prices are marked explicitly.
