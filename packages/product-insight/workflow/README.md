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

Read the latest explicitly approved native or PTC plan result from durable Session events with `latestApprovedProductPlan()`, then pass its exact Markdown, identity, and review time to `productPlanFromApproval()`. It requires one `product-insight-plan-json` block containing product name, developer, official URL, scope, questions, and explicit candidate-page and elapsed-time limits. New plans can approve `maximumPageCharacters` from 12,000 to 48,000 and separate `maximumGapReads` and `maximumGapSearches` limits up to the question count. Omitting a gap limit disables that operation. Omitting the page limit retains the 12,000-character bound. The plan may also approve external publisher names and domains and require a region, product version, or minimum source date. The resulting product and plan identities are stable across replay. Alternatively, call `runApprovedProductInvestigation()` to perform this handoff and start the runner in one step, with a search-result bound, extraction method identity, Web search and fetch, durable text, pages, checkpoints, evidence, claims and report storage, a clock, `proposeEvidence`, `reviewEvidence`, `compareClaim`, and `saveVerification`. A programmatic adapter can return `'retry'` from `recoverEvidenceFailure` for a transient extraction failure or `true` for an output failure eligible for splitting. `recoverReviewFailure` and `recoverComparisonFailure` classify output errors eligible for one split into two smaller requests. Omission leaves affected work unrecovered. An optional checkpoint resumes only the exact approved plan; without one, discovery starts fresh. The adapters must save each complete checkpoint before later model work and log model-visible requests in the owning session. The result contains run, discovery and fetch outcomes, verified excerpts, reviewed source-bound claims, cross-source judgments, open question gaps, a report assessment, and blocked, draft or final delivery.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

The runner uses available follow-up searches before targeted reads of saved pages, so newly fetched pages can use the remaining approved read allowance. A read with no matching saved fragment does not spend that allowance. A wrong model offset is repaired only when the exact excerpt occurs once in its supplied fragment; repeated or absent excerpts remain rejected.

[The approval handoff](src/approved-plan.ts) finds an explicit approval in Session events and validates the structured block; parsing a proposed plan alone never grants approval. [The runner](src/index.ts) rechecks approval, discovers candidates, fetches selected pages, splits complete saved text into bounded windows with a 1,499-code-unit overlap setting, verifies proposals at their full-page offsets, suppresses identical proposals from adjacent windows, and checkpoints accepted evidence after each fragment before review. A transport failure or per-request timeout can retry the same window once after 500 milliseconds. An eligible model-output failure can split a window once into two smaller overlapping ranges. Each window uses one recovery path within the approved elapsed time. Cancellation ends a pending retry and records active elapsed time at the existing checkpoint cursor. Successful children preserve their evidence; an unrecovered range leaves delivery as a draft. New runs rank each page's first-pass windows by matches to approved questions. Questions with no verified excerpt take the first turn, and unmatched windows follow in source order. Version 3 checkpoints record the dispatch order for an unfinished page. Versions 1 and 2 resume in source order with their original window layouts. [The review decision](src/claim-review.ts) requires one judgment per excerpt and admits a source-bound claim only for an explicit `supported` verdict. A failed review batch may split once into two smaller batches; valid half-batch judgments and claims are retained, while an unrecovered half leaves delivery as a draft. If an approved question still has no admitted claim, the runner can search an approved publisher host once for that question, admit new or newly selected pages within the original page and time bounds, and extract and review their evidence. New selected pages can replace unselected candidates when the pool is full. [Cross-source checking](src/claim-verification.ts) selects one key claim per question, compares it with every other admitted statement for that question, and rejects missing or invented judgments. Valid batches and half-batches survive another comparison failure; an incomplete question remains a draft. [Report evaluation](src/report.ts) requires eligible key and supporting sources from separate hosts and publishers, besides complete searches, valid citations, current source hashes, and no conflicting or uncertain comparison. It also renders actual query outcomes, candidate and fetch counts, and truncation without promoting search metadata to evidence or exposing provider error text. External sources require a user-approved publisher domain and matching page declaration. Explicit region, version, and date criteria must match captured declarations; missing values remain unknown. A report with evidence but unmet checks remains a cited draft.

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

For each selected page, the background investigation sends its canonical text, source URL, and the approved questions linked to that page. The model returns a JSON array of `verbatimExcerpt`, `sourcedStatement`, and `questionIds` proposals, with `startHint` when an excerpt repeats in the supplied window. The workflow verifies each excerpt against saved text and rejects ambiguous or missing matches. Malformed, oversized, or incomplete model output may trigger two smaller requests for a sufficiently long window. A second request reviews batches of eight excerpts and statements, returning `evidenceId`, `verdict`, supported `questionIds`, and `rationale`. An invalid review response may trigger two smaller review requests; only `supported` statements with valid question links become low-confidence `ProductClaim` records. Before an approved gap search, a gap read may extract from the strongest lexical match in a saved eligible page for an unanswered question. The normal excerpt verification and semantic review apply to the new evidence. The committed checkpoint retains the finished reread pass and the previous reviews. An approved gap search can fetch additional pages for a question with no admitted statement. After cross-source checking, a key claim without independent support may use the remaining search allowance for a different approved publisher. New pages enter the same extraction and review path. When the key claim stays the same, the workflow retains existing judgments and compares only the new admitted statements. A third request compares each question's key claim with other admitted statements in batches of eight, returning `supports`, `contradicts`, `unrelated`, or `uncertain` plus a reason for every comparison. Invalid comparison output can trigger two smaller requests for that batch. Page text and model proposals are untrusted data. The job saves a cited final report only when deterministic delivery checks pass, otherwise a draft or blocked result. Approval concludes the planning turn. The host starts the Session-owned job, and the transcript renders progress and the saved report without waking the chat model. For a report that passes delivery checks, the Session tool sends the approved scope and one key and one corroborating statement with their exact excerpts per question. The model returns one plain text answer per question with both evidence IDs. The workflow checks the JSON and reference sets, then resolves source links from captured pages. An invalid response prompts one complete regeneration using the same evidence and a diagnostic without source text. Output exhaustion prompts a shorter answer. A transport failure or timeout during dispatch or streaming waits 500 milliseconds and retries the same evidence request. The three recovery paths share a single retry. User cancellation and the approved deadline stop the wait and dispatch. If synthesis fails, the report retains the cited investigation record as a draft and explains the failure. Existing draft and blocked assessments skip synthesis. Programmatic callers can opt in with `synthesizeReport`. Semantic review applies to the source statements, and synthesis validation checks the answer structure and references.

Product reading preserves mechanisms, conditions, version scope, and source attribution. Synthesis answers approved questions in connected paragraphs without the former 500-character per-answer cap; shared output, time, and report-size budgets remain enforced. Reports place evidence and cross-source checks after the main text. Drafts without synthesis explicitly identify source statements. Existing semantic review and corroboration gates remain unchanged, as do the eight-draft page limit and two-excerpt synthesis input per question.

#### Token effect

The approved plan allows at most 12 candidate pages and 20 elapsed minutes. It starts one search per question. The `maximumGapSearches` allowance covers both unanswered questions and missing independent support, with at most one follow-up per question. Unanswered questions use the allowance first. Plans omitting the allowance skip follow-up searches. A page keeps the approved 12,000–48,000-character bound; an older plan without `maximumPageCharacters` retains 12,000. Each extraction request reads at most 12,000 UTF-16 code units and allows a share of eight drafts per page. New runs use a 1,499-code-unit overlap setting, so a 48,000-character page requires at most five initial extraction calls. Ranking preserves each source window and its original share of the draft allowance. A classified model-output failure may add two smaller calls when the original window has at least 3,000 code units and at least two draft slots. A same-window retry sends the same source range, questions, and draft allowance. Regular extraction makes at most 12 calls per page including retries and split children. Gap rereads use at most `maximumGapReads` calls across the investigation, including retries. Each unanswered question can select one saved range and retry it once after a transient failure if an approved call remains. Each sends at most 3,000 UTF-16 code units and proposes at most two excerpts within the original eight-excerpt page bound. Each extraction call allows at most 8,192 output tokens and 40,000 response bytes; a known model context window is checked against estimated input plus output reserve before dispatch. A review pass over at most 96 accepted excerpts triggers up to 12 initial semantic review calls and, after one split per failed batch, at most 36 review calls total; each allows at most 4,096 output tokens. In one comparison pass, at most five key claims can trigger up to 60 initial cross-source calls or 180 total calls when failed batches split once; each allows at most 2,048 output tokens. Every model call has a 60-second limit and the approved elapsed-time limit can stop the sequence earlier. Requests and results are saved in the Session before their downstream decisions are used. Synthesis makes at most two calls within the approved elapsed time, each capped at 4,096 output tokens, 20,000 response bytes and 60 seconds. The Session records the attempt number before dispatch and the outcome before reuse. Resumption reuses matching settled attempts, including a recorded transient failure that selects the second attempt.

#### KV Cache effect

Extraction requests are page-local; semantic and cross-source requests contain up to eight evidence records. None replays the Session conversation. The product preset adds start, result-reading, and generic job-control tool schemas to subsequent Agent requests. Synthesis also uses a standalone request containing only the approved scope, questions and selected excerpts.

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
