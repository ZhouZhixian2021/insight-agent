---
description: "Run an approved product investigation and evaluate cited report delivery."
kind: "package-reference"
---

# @deepseek-ai/dsh-product-insight-workflow

Incomplete model responses record their finish kind. Review admits valid judgments individually; failed items retain diagnostics without discarding valid siblings or independently blocking delivery.

English | [中文](README.zh.md)

Publisher, region, version, date and changed-source observations are disclosures. Historical uncertain or conflicting comparisons do not independently block delivery. Source support and citation integrity still determine which statements can enter confirmed prose.

## Summary

Trace retains operation failures, and reports disclose search outcomes, candidate counts and coverage boundaries. Questions without usable conclusions remain unanswered; missing independent corroboration triggers no extra stage or search. No evidence still blocks report creation; identity and citation errors, cancellation and report-generation failures still affect delivery. Historical reports are not automatically reassessed.

This package runs an approved `ProductPlan` through bounded discovery, page acquisition, exact excerpt verification, semantic support review, approved question-gap searches, and report evaluation. The product preset host starts a Session-owned background job using the selected model and Web provider. The report shows the observed search and page-acquisition scope alongside cited conclusions. Source text, complete stage checkpoints, evidence, comparisons, claims, and report results are saved in the Session. After an interruption, another explicit start call resumes the same approved plan from its latest checkpoint. `get_product_investigation` reads the saved result after completion. Programmatic callers may supply their own adapters.

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

Search recognition and the approved background investigation use the session-selected model. Product model retries retain that route; no backup model is selected. Each product model request stores a trace ID in its Session request event and sends it as `x-request-id`; adapter diagnostics log the same ID, HTTP status, response and first-stream-byte times, stream byte count, and safe error codes without recording prompts or credentials. Historical request events without a trace ID remain readable.

Read the latest explicitly approved native or PTC plan result from durable Session events with `latestApprovedProductPlan()`, then use `productPlanFromApproval()` to reconstruct the exact identity and reviewed plan. Parsing alone does not approve execution. New plans allow up to 30 candidate pages and may omit overall elapsed-time and per-page canonical-text limits. Explicitly approved limits still apply. Without a page character limit, complete cleaned text is handled under model capacity, transport resource protection and cancellation.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

The runner uses available follow-up searches before targeted reads of saved pages, so newly fetched pages can use the remaining approved read allowance. A read with no matching saved fragment does not spend that allowance. A wrong model offset is repaired only when the exact excerpt occurs once in its supplied fragment; repeated or absent excerpts remain rejected.

[The approval handoff](src/approved-plan.ts) checks durable explicit approval. [The runner](src/index.ts) discovers and fetches pages, indexes question-targeted passages for new investigations, and asks the model to select saved passage IDs. Adjacent context explains conditions but is not automatically cited. Evidence retains full-page offsets and supporting excerpts; historical checkpoints retain their windowed execution. Transport failures use bounded retries and incomplete model output can split; valid items commit independently. Source review is followed only by approved unanswered-question gap searches or reads, then synthesis, without an independent corroboration stage.

[The product tool](src/session-tool.ts) saves source text, evidence, reviews, claims, model requests and checkpoints in the Session. Resumption checks pages again but retains saved material when a page changes or cannot be fetched; reports disclose the captured snapshot. Cancellation still interrupts work. Saved model responses with matching inputs can be reused, and restarting a settled plan returns its saved result.

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

For new investigations, the reading model receives question-retrieved passage IDs, exact text and neighboring context, then selects excerpts supporting a statement. Complete canonical text remains saved in the Session. Semantic review checks statements against excerpts; synthesis uses checked material and marks unanswered questions. Draft and final reports share a structure, and inline citations must refer to supplied evidence.

Reading preserves mechanisms, conditions, versions and attribution. Writing explains substance without repetitive source-announcement phrases while retaining vendor attribution. Passage extraction follows the source package selection constraints; synthesis has no extra per-question reference or report byte cap. Independent corroboration is not an execution stage.

#### Token effect

Each query requests up to 60 merged search results and retains at most 30 approved candidates. First-round extraction has no fixed per-page evidence count; extraction output follows the selected model route capacity without a product-specific token or response-byte cap. Semantic review retains its separate 8,192-token and eight-item batch limits. Known model context capacity includes serialized input and the response reserve; when the route omits a request output limit, extraction reserves 8,192 tokens for this check without imposing that limit on the request. Oversized extraction, review and synthesis requests split; a single item that still cannot fit fails explicitly. Search-layout recovery uses at most 1,024 output tokens per engine. Provider timeouts, cancellation and bounded retries remain in force.

Passage evidence extraction has no additional 60-second request deadline. The approved run limit, retry budget, provider timeouts and explicit cancellation still apply.

#### KV Cache effect

Extraction uses question-local passages and sends only selected saved-page text, while semantic and cross-source review dispatch batches of up to eight records. Synthesis may split by question and evidence batch. Every request and result is saved with plan identity for Trace; old events without that identity remain readable but are not assigned to another run.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Process-local jobs** — The task continues after its starting tool call ends while the owning Agent remains active. After a process restart, the live job is gone and its saved task record is reported as interrupted. A new explicit call can resume committed work for the same approved plan. An uncommitted model response may need another call; automatic continuation and an independent progress page are not implemented.
- **Revalidation scope** — Resumption re-fetches selected URLs but retains saved snapshots, evidence and reviews even when a source changes or cannot be fetched. Reports disclose that they describe captured content, not necessarily the current page. Cancellation still interrupts resumption.
- **Source limitations** — Domain approval, region, version, date and snapshot mismatches are report disclosures, not standalone draft reasons. Discovery still screens domains before fetching. Statements without semantic support or a matching saved snapshot do not enter confirmed prose; a report with no supported statements explicitly leaves questions unanswered. No evidence still blocks report creation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The caller must persist run events and model requests so a resumed investigation can reconstruct its decisions.

</details>

Product mode owns its job controller and does not mount the generic job-completion notifier. New approved plans start after the planning turn becomes idle; rejected or dismissed plans do not start. Restart the service and open a new product session to test the updated preset. Historical saved reports remain readable; unfinished historical plans are not silently restarted.

Review judgments are admitted individually; missing or invalid judgments do not discard valid siblings or independently block delivery. Missing records are disclosed per question. Reviews may associate evidence with another approved question while preserving extraction-time associations. Synthesis places evidence markers after supported sentences; validated references become numbered footnotes and clickable superscripts in chat and HTML. Existing paragraph-end citations are not relocated automatically; regenerate those reports.
