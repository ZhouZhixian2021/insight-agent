---
description: "Run an approved product investigation and evaluate cited report delivery."
kind: "package-reference"
---

# @deepseek-ai/dsh-product-insight-workflow

Incomplete model responses now record their finish kind. Missing independent support is disclosed without extra comparison calls or searches; original-source eligibility still applies. The delivery-reason list omits duplicate unanswered-claim checks and keeps the general cross-site limitation in report limitations.

English | [中文](README.zh.md)

Missing or mismatched page publisher declarations are disclosed per question, without rejecting evidence from an approved domain. Historical uncertain or conflicting comparisons are also disclosures: source-supported statements remain available to synthesis with their differing conditions. Original-source support, citation integrity, freshness, approved domains and explicit scope checks remain enforced.

## Summary

Run an approved product plan through page discovery, source-text checks, semantic support review, and cited report delivery. The Session-owned background job saves pages, evidence, checkpoints, claims, and the report so an interrupted plan can resume after an explicit request. Questions without supported conclusions remain visible for user-initiated follow-up. Delivery can be final, draft, or blocked according to evidence and report checks; search and acquisition limits are disclosed in the saved report.

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

Run settlement also records the questions that still lack an admitted conclusion. The product transcript uses those records for optional follow-up planning; follow-ups receive a new approved plan and do not mutate the settled report.

Read the latest explicitly approved native or PTC plan result from durable Session events with `latestApprovedProductPlan()`, then use `productPlanFromApproval()` to reconstruct the exact identity and reviewed plan. Parsing alone does not approve execution. The structured block accepts version 1, the legacy publisher allowlist that historical plans keep using, and version 2, which requires `focus` with the directions the user confirmed from the fixed vocabulary plus any custom wording. Version 2 rejects `sourcePublishers` and accepts `additionalSites` only as sites the user named. New plans allow up to 30 candidate pages and omit elapsed-time and canonical-page character limits. Explicit limits in historical plans remain enforced.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

A wrong model offset is repaired only when the exact excerpt occurs once in its supplied fragment; repeated or absent excerpts remain rejected.

[The approval handoff](src/approved-plan.ts) finds an explicit approval in Session events and validates the structured block; parsing a proposed plan alone never grants approval. [The runner](src/index.ts) rechecks approval, discovers candidates, fetches selected pages, uses complete saved text for new plans and retains bounded overlapping windows for historical plans with explicit page limits, verifies proposals at their full-page offsets, suppresses identical proposals from adjacent windows, and checkpoints accepted evidence after each fragment before review. A transport failure or per-request timeout can retry the same window once after 500 milliseconds. An eligible model-output failure can split a window once into two smaller overlapping ranges. Each window uses one recovery path within the approved elapsed time. Cancellation ends a pending retry and records active elapsed time at the existing checkpoint cursor. Successful children preserve their evidence; an unrecovered range is disclosed; valid remaining material can still be delivered. Legacy windowed runs rank each page's first-pass windows by matches to approved questions. Questions with no verified excerpt take the first turn, and unmatched windows follow in source order. Version 3 checkpoints record the dispatch order for an unfinished page. Versions 1 and 2 resume in source order with their original window layouts. [The review decision](src/claim-review.ts) requires one judgment per excerpt and admits a source-bound claim only for an explicit `supported` verdict. A failed review batch may split once into two smaller batches; valid half-batch judgments and claims are retained, while an unrecovered half leaves delivery as a draft. The runner proceeds from original-source support review directly to synthesis; unanswered questions remain available for a new user-approved investigation. It does not invoke independent comparison or search for corroboration; historical comparisons remain readable on resume. [Report evaluation](src/report.ts) requires eligible sources, valid citations, current source hashes, and no conflicting or uncertain comparison. Failed operations, limited searches, unanswered questions, and missing independent corroboration are disclosures rather than standalone draft reasons. It also renders actual query outcomes, candidate and fetch counts, and truncation without promoting search metadata to evidence or exposing provider error text. External sources require a user-approved publisher domain and matching page declaration. Explicit region, version, and date criteria must match captured declarations; missing values remain unknown. A report with evidence but unmet checks remains a cited draft.

[The product tool](src/session-tool.ts) starts work only after an explicitly approved plan is durable. Oversized converted text can fall back to the registered HTTP provider for the same approved URL. It logs canonical page text, page identity and scope declarations, accepted evidence, exact fragment extraction, review and comparison requests and responses, admitted claims, per-question verification, complete checkpoints, the draft, and run settlement in the owning Session. [Background state](src/background-run.ts) records job transitions alongside these facts. An explicit call after interruption verifies saved text and evidence, then re-fetches every selected page. Matching content and publisher, date, version and region declarations retain the page or fragment cursor; a change resets downstream evidence, review, claims and comparisons before they can affect delivery. A failed re-fetch stops continuation and keeps the old checkpoint for another attempt. Committed model responses with matching inputs can be reused. Approved elapsed time counts checkpointed active execution across attempts. Repeating a settled approved plan returns its saved result; `get_product_investigation` reads the result or latest task state without starting work.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Product insight model](../model/README.md) defines approved plans, evidence, runs, and report delivery.
- [Product source](../source/README.md) owns Web acquisition and exact excerpt verification.

-----

<a id="model-experience"></a>
## Model Experience

Extraction requests use request-local Q1/Q2 question aliases and restore full IDs before evidence admission. A complete JSON code fence is removed without a model call. Valid array entries survive invalid siblings; one targeted repair receives only the rejected entries plus the unchanged source context. Unresolved entries remain in extraction diagnostics. Completely malformed JSON still uses the existing recovery path. A run-local cache reuses clean extraction output only for byte-identical saved text with the same origin, plan, product, source type, publisher, questions, model configuration, prompt and fragment range. Different language, regional content or questions are processed separately. Every reused result is checked against the receiving snapshot and retains that page’s own evidence identity; reuse and item diagnostics are recorded in Trace.

Source-support review uses batches of 24 with up to three calls in flight. It sees excerpts and statements, not research questions; supported statements do not require reviewer-assigned question IDs. Extraction question links remain discovery hints. Synthesis shares all eligible supported evidence and chooses citations and sections from the material; unrelated material can remain unused, and uncovered questions are recorded separately. Results carry their request sequence for replay and Trace pairing. Checkpoints save completed siblings while the cursor advances only across settled batches; resume skips saved reviews even when they completed out of order.

### Search recognition

#### What the model sees

When ordinary search parsing fails, the current session model receives a bounded rendered search-page observation and selects only displayed link IDs through `product/search-recognize`. Search snippets and selected links remain discovery material, never evidence.

#### Token effect

Each recognition request has at most 1,024 output tokens per engine. A failed or uncheckpointed discovery can repeat recognition; ordinary parsed results need no recognition request.

#### KV Cache effect

Recognition is a separate model request using the selected route and does not replay the conversation.

### Product evidence extraction and writing

#### What the model sees

The reading model receives the source URL, approved questions and complete canonical page text when it fits the configured context; larger pages are split without dropping text. Excerpts must match saved text, statements are written in Simplified Chinese while excerpts keep the page language, and semantic review admits only supported statements. Synthesis receives eligible evidence once and cites its identities; research coverage is kept separately from the narrative.

#### Token effect

The workflow splits extraction and review requests when context capacity requires it. It does not impose a product-specific output-token cap or an additional 60-second model deadline. Narrative synthesis receives a deduplicated global evidence pool and research questions as coverage guidance, not prescribed chapters. The [insight output handler](src/insight-output.ts) accepts material-led sections and separate question coverage records. It reuses citation normalization for unambiguous aliases, unique prefixes and wrappers. Each rejected section or coverage record receives one targeted repair; accepted siblings remain unchanged. Missing report structure receives one structural retry. Unresolved coverage is disclosed as a generation gap, not proof that source material is absent. Coverage never certifies factual accuracy or blocks usable prose. If deduplicated synthesis material still exceeds model context, generation reports the capacity failure explicitly rather than truncating evidence or reverting to question-wise reports.

Reports preserve paragraph boundaries and sentence-level citation footnotes. A collapsible coverage appendix maps investigation questions to report sections; sections can address multiple questions. Failed narrative generation retains labeled source points as a fallback. Historical question-map adapters remain readable; new Session synthesis uses narrative sections.

#### KV Cache effect

Extraction is page-local; review uses batches of at most 24 evidence items with three concurrent batches. Each request and response is saved for trace and recovery, including accepted coverage question IDs, section repair reasons and normalization notes for synthesis; historical results without these optional diagnostics are re-inspected from raw output, and a new user-directed follow-up runs under a new approved plan.

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

Review judgments are admitted individually; missing or invalid judgments do not discard valid siblings or independently block delivery. Missing records are disclosed per question. Reviews may associate evidence with another approved question while preserving extraction-time associations. Synthesis places evidence markers after supported sentences; validated references become numbered footnotes and clickable superscripts in chat and HTML. Existing paragraph-end citations are not relocated automatically; regenerate those reports.

The approved Session entry point carries successful structured web-search results from the same planning turn into discovery. It excludes earlier turns, failed calls and results after the plan call. Existing checkpoints retain their saved candidate pool; newly started investigations use the handoff. Assistant-written links are not treated as observed search results.

Full-page extraction uses a bounded look-ahead window of three concurrent model requests. Results and checkpoints commit in source order; retries occupy the current page slot. Cancellation stops new dispatch and waits for outstanding requests. Historical plans with explicit page character limits retain sequential fragment extraction. On restart, uncommitted look-ahead pages are revisited; the Session adapter reuses matching completed model responses when available.
