---
description: "Run an approved product investigation and evaluate cited report delivery."
kind: "package-reference"
---

# @deepseek-ai/dsh-product-insight-workflow

Incomplete model responses now record their finish kind. An analysis batch failure remains a delivery reason but does not prevent approved gap reads or searches for other questions. Missing independent support can use the remaining approved publisher search allowance even when the key source also lacks a required declaration; neither search nor a second source waives source eligibility. The delivery-reason list omits duplicate unanswered-claim checks and keeps the general cross-site limitation in report limitations.

English | [中文](README.zh.md)

## Summary

This package runs an approved `ProductPlan` through bounded discovery, page acquisition, exact excerpt verification, semantic support review, cross-site claim comparison, approved question-gap searches, and report evaluation. The product preset host starts a Session-owned background job using the selected model and Web provider. The report shows the observed search and page-acquisition scope alongside cited conclusions. Source text, complete stage checkpoints, evidence, comparisons, claims, and report results are saved in the Session. After an interruption, another explicit start call resumes the same approved plan from its latest checkpoint. `get_product_investigation` reads the saved result after completion. Programmatic callers may supply their own adapters.

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

The product preset configures `wowei-gate/deepseek-v4-pro` as the fallback for the session-selected model. `fallbackRoutes` is an ordered list of `{ provider, model }` pairs and may be empty. A fallback on the same provider still depends on that provider's endpoint. Each product model request stores a trace ID in its Session request event and sends it as `x-request-id`; adapter diagnostics log the same ID, HTTP status, response and first-stream-byte times, stream byte count, and safe error codes without recording prompts or credentials. Historical request events without a trace ID remain readable.

Read the latest explicitly approved native or PTC plan result from durable Session events with `latestApprovedProductPlan()`, then use `productPlanFromApproval()` to reconstruct the exact identity and reviewed plan. Parsing alone does not approve execution. New plans allow up to 12 candidate pages and 20 minutes, with an approved per-page limit of 12,000–48,000 characters. A plan without an explicit page limit retains the 12,000-character default.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

The runner uses available follow-up searches before targeted reads of saved pages, so newly fetched pages can use the remaining approved read allowance. A read with no matching saved fragment does not spend that allowance. A wrong model offset is repaired only when the exact excerpt occurs once in its supplied fragment; repeated or absent excerpts remain rejected.

[The approval handoff](src/approved-plan.ts) finds an explicit approval in Session events and validates the structured block; parsing a proposed plan alone never grants approval. [The runner](src/index.ts) rechecks approval, discovers candidates, fetches selected pages, uses keyword-ranked saved-page passages for new plans and retains bounded overlapping windows for historical checkpoints, verifies proposals at their full-page offsets, suppresses identical proposals from adjacent windows, and checkpoints accepted evidence after each question or legacy fragment before review. Transport failures and request timeouts retry with exponential backoff for at most five attempts within 120 seconds. Retries use the page model-call allowance, not the approved gap-search allowance. Three consecutive transient failures switch to the next configured `fallbackRoutes` model after local route validation. An eligible model-output failure can split a window once into two smaller overlapping ranges. Each window uses one recovery path within the approved elapsed time. Cancellation ends a pending retry and records active elapsed time at the existing checkpoint cursor. Successful children preserve their evidence; an unrecovered range leaves delivery as a draft. Legacy windowed runs rank each page's first-pass windows by matches to approved questions. Questions with no verified excerpt take the first turn, and unmatched windows follow in source order. Version 3 checkpoints record the dispatch order for an unfinished page. Versions 1 and 2 resume in source order with their original window layouts. [The review decision](src/claim-review.ts) requires one judgment per excerpt and admits a source-bound claim only for an explicit `supported` verdict. A failed review batch may split once into two smaller batches; valid half-batch judgments and claims are retained, while an unrecovered half leaves delivery as a draft. If an approved question still has no admitted claim, the runner can search an approved publisher host once for that question, admit new or newly selected pages within the original page and time bounds, and extract and review their evidence. New selected pages can replace unselected candidates when the pool is full. [Cross-source checking](src/claim-verification.ts) selects one key claim per question, compares it with every other admitted statement for that question, and rejects missing or invented judgments. Valid batches and half-batches survive another comparison failure; an incomplete question remains a draft. [Report evaluation](src/report.ts) requires eligible key and supporting sources from separate hosts and publishers, besides complete searches, valid citations, current source hashes, and no conflicting or uncertain comparison. It also renders actual query outcomes, candidate and fetch counts, and truncation without promoting search metadata to evidence or exposing provider error text. External sources require a user-approved publisher domain and matching page declaration. Explicit region, version, and date criteria must match captured declarations; missing values remain unknown. A report with evidence but unmet checks remains a cited draft.

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

### Product evidence extraction

#### What the model sees

The workflow sends keyword-ranked saved-page passages and neighboring context with approved questions to the reading model. The model returns passage IDs and a supported statement; the program copies up to three exact excerpts from the saved source and checks their offsets and hash. Semantic review receives all supporting excerpts and context. Search-layout recovery separately asks the model to select observed link IDs; it cannot introduce an unobserved URL or turn a search snippet into evidence. Synthesis receives eligible reviewed evidence and writes a cited answer or an explicit gap, preserving conditions, version, attribution and uncertainty.

#### Token effect

Each query requests up to 60 merged search results and retains at most 12 approved candidates; each page yields at most eight evidence records. Product model output is capped at `8,192` tokens. Known model context capacity includes serialized input and the response reserve, so extraction, review and synthesis split oversized requests. A single item that still cannot fit fails explicitly. Search-layout recovery uses at most 1,024 output tokens per engine. Provider timeouts, cancellation and bounded retries remain in force.

#### KV Cache effect

Extraction uses question-local passages and sends only selected saved-page text, while semantic and cross-source review dispatch batches of up to eight records. Synthesis may split by question and evidence batch. Every request and result is saved with plan identity for Trace; old events without that identity remain readable but are not assigned to another run.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Process-local jobs** — The task continues after its starting tool call ends while the owning Agent remains active. After a process restart, the live job is gone and its saved task record is reported as interrupted. A new explicit call can resume committed work for the same approved plan. An uncommitted model response may need another call; automatic continuation and an independent progress page are not implemented.
- **Revalidation scope** — Explicit resumption re-fetches the selected URLs. It keeps matching source snapshots and their checked evidence and reviews. Changed sources are extracted again, and the workflow rechecks comparisons with a changed key claim or new candidate evidence. New products, questions or sites need a newly reviewed plan. The page's publisher declaration remains self-reported.
- **Page declarations are not ownership proof** — Final checks the approved domain against the fetched host and the page's self-declared publisher. These checks do not independently establish legal publisher ownership, source truth, or actual product behavior. The Web fetch result exposes no HTTP headers; JavaScript-rendered metadata remains outside acquisition. Text PDF citations include a physical page link, and missing PDF scope declarations remain unknown. A dedicated report UI remains separate work.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The caller must persist run events and model requests so a resumed investigation can reconstruct its decisions.

</details>

Product mode owns its job controller and does not mount the generic job-completion notifier. New approved plans start after the planning turn becomes idle; rejected or dismissed plans do not start. Restart the service and open a new product session to test the updated preset. Historical saved reports remain readable; unfinished historical plans are not silently restarted.
