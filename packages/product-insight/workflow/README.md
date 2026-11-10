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

Read the latest explicitly approved native or PTC plan result from durable Session events with `latestApprovedProductPlan()`, then use `productPlanFromApproval()` to reconstruct the exact identity and reviewed plan. Parsing alone does not approve execution. New plans allow up to 30 candidate pages and omit elapsed-time and canonical-page character limits. Explicit limits in historical plans remain enforced.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

The runner uses available follow-up searches before targeted reads of saved pages, so newly fetched pages can use the remaining approved read allowance. A read with no matching saved fragment does not spend that allowance. A wrong model offset is repaired only when the exact excerpt occurs once in its supplied fragment; repeated or absent excerpts remain rejected.

[The approval handoff](src/approved-plan.ts) finds an explicit approval in Session events and validates the structured block; parsing a proposed plan alone never grants approval. [The runner](src/index.ts) rechecks approval, discovers candidates, fetches selected pages, uses complete saved text for new plans and retains bounded overlapping windows for historical plans with explicit page limits, verifies proposals at their full-page offsets, suppresses identical proposals from adjacent windows, and checkpoints accepted evidence after each fragment before review. A transport failure or per-request timeout can retry the same window once after 500 milliseconds. An eligible model-output failure can split a window once into two smaller overlapping ranges. Each window uses one recovery path within the approved elapsed time. Cancellation ends a pending retry and records active elapsed time at the existing checkpoint cursor. Successful children preserve their evidence; an unrecovered range leaves delivery as a draft. Legacy windowed runs rank each page's first-pass windows by matches to approved questions. Questions with no verified excerpt take the first turn, and unmatched windows follow in source order. Version 3 checkpoints record the dispatch order for an unfinished page. Versions 1 and 2 resume in source order with their original window layouts. [The review decision](src/claim-review.ts) requires one judgment per excerpt and admits a source-bound claim only for an explicit `supported` verdict. A failed review batch may split once into two smaller batches; valid half-batch judgments and claims are retained, while an unrecovered half leaves delivery as a draft. If an approved question still has no admitted claim, the runner can search an approved publisher host once for that question, admit new or newly selected pages within the original page and time bounds, and extract and review their evidence. New selected pages can replace unselected candidates when the pool is full. [Cross-source checking](src/claim-verification.ts) selects one key claim per question, compares it with every other admitted statement for that question, and rejects missing or invented judgments. Valid batches and half-batches survive another comparison failure; an incomplete question remains a draft. [Report evaluation](src/report.ts) requires eligible key and supporting sources from separate hosts and publishers, besides complete searches, valid citations, current source hashes, and no conflicting or uncertain comparison. It also renders actual query outcomes, candidate and fetch counts, and truncation without promoting search metadata to evidence or exposing provider error text. External sources require a user-approved publisher domain and matching page declaration. Explicit region, version, and date criteria must match captured declarations; missing values remain unknown. A report with evidence but unmet checks remains a cited draft.

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

Search recovery uses the current session model to select numeric IDs from observed rendered links, with at most 1,024 output tokens per engine and the search operation deadline. It logs the exact prompt, page observations, response and failure before results are used. It cannot introduce a URL absent from the observed page. Recovery does not turn search snippets into evidence; selected target pages follow normal acquisition and verification. A resumed search can repeat recognition if discovery was not checkpointed.

### Product evidence extraction

#### What the model sees

The background investigation sends complete canonical page text, URL and approved questions to the reading model when they fit its configured context. Oversized input is partitioned without discarding text, preserving full-source offsets. Exact excerpts are checked against the saved source before semantic review. All source-qualified, reviewed evidence for each question is available to synthesis. Missing evidence produces an explicit incomplete answer. Draft and final reports share the same writing structure. Synthesis validates JSON and evidence identities and may regenerate once per batch after malformed output or a transient failure; cancellation stops pending work.

Reading preserves mechanisms, experimental conditions, versions and attribution. Writing leads with substantive answers instead of repetitive source-announcement phrases, while retaining attribution for vendor claims and unverified measurements. There are no fixed page-level excerpt counts, excerpt or statement character limits, per-question reference counts, response byte limits or report byte limits. Semantic and corroboration requirements remain enforced.

#### Token effect

Each query requests up to 60 merged search results; up to 30 candidate pages are retained under the approved plan. A result cap does not guarantee that many links. Source domains are screened before acquisition. New plans omit an overall time deadline; explicit historical deadlines still apply. Model requests use the selected route output configuration instead of product-specific 4096/8192-token clamps and the extra 60-second model deadline is removed. When context capacity is available, estimated serialized input plus the response reserve must fit; evidence, review and synthesis requests are divided when needed. A single comparison or synthesis evidence item too large to fit fails explicitly rather than being truncated. Routes without disclosed context capacity retain provider-side validation. Provider network timeouts, cancellation, approved follow-up allowances and bounded failure retries remain in force. Saved results support restart without discarding accepted evidence.

#### KV Cache effect

Extraction is page-local and may span multiple capacity-sized requests. Semantic and cross-source review still dispatch batches of up to eight records, without limiting the total evidence count. Synthesis includes all eligible references and may split by question and evidence batch; each request and result is saved. Product model events optionally carry the plan identity for the chat Trace projection. Historical events without that identity remain readable but are not guessed into another run.

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
