---
description: "Web-client surface for the academic research report: a Session-backed Remote run viewer and an internal HTML report renderer."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-academic-research

English | [中文](README.zh.md)

Settled reports offer a self-contained HTML download alongside Markdown. HTML uses the existing Markdown renderer, then an inert allowlist serializer: inline styles, local contents and evidence links, no scripts or external resources. It preserves report quality, limitations, missing evidence and synthetic markers independently of UI search. The Trace panel queries actual Session/run diagnostics on demand, filters stage and state, pages observations and exports the current safe page. Closing the viewer aborts only its query. Trace does not infer old calls or missing queue times, and does not automatically poll or start research.

HTML reading uses a sidebar contents list, a constrained reading column and expandable support lists. Supplementary scope, question checks and evidence indexes follow the narrative; all original content remains available. Delivery blockers stay expanded, while content limitations have a counted disclosure. Evidence aliases E1, E2 link to complete records. Presentation does not rewrite Markdown, claims or quality decisions.

## Summary

The Chat transcript shows a separate research card for each explicitly approved academic plan. The current approved plan starts through the existing Remote; progress, evidence and report downloads remain in that card while subsequent requests receive independent plans and cards in the same Session.

During candidate selection, the live view shows completed model reviews against the bounded review plan, failures that kept lexical screening, and eligible works left without model review. These counts are distinct from the screening stage's deduplicated-work total.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The plugin registers a Conversation Definition and the academic-research renderer in conversation.chat.node. Native and PTC plans stay hidden until explicit approval; ordinary plans and dismissed reviews never start research. Session identity comes from the standard Chat scope. Research cards use the turn position outside process disclosures, following the completed answer. The legacy dialog and fixed previews remain test components and are not production entry points.

The Q6 demo’s “Run lifecycle preview” uses a separate fixed JSON dataset for the phase-one Q7.4 follow-up. It separates viewing connection from running, paused, completed, limited-completion, failed and cancelled states. Closing, reopening or switching preview records retains the same local record and any draft; explicit demo cancellation alone changes cancellation state. Funnel limits are not pass counts, partial usability is not final inclusion, and unknown counts or stage durations stay unknown. Draft downloads use `academic-demo-draft.md`. These controls do not invoke Remote; retained state lasts only within the mounted Web page. The live form uses Session-owned background tasks independently of this preview.

The real run viewer consumes complete Q6 and result projections from `watchBackgroundRun`. It binds Session, run and Brief identity, ignores older Q6 sequences, and retains observed facts on interruption. Formal plan, paper metadata, authoritative queues, rounds and one-based displayed batch numbers reuse the read-only views. Coverage pending, available, truncated and failed states remain distinct. Per-question supporting work IDs, evidence IDs and gaps come directly from the settled coverage; candidate `matchedQuestions` never create evidence support. A final result without Q6 is explicitly unavailable and never falls back to the demo.

The internal “Q6 read-only demo” test component does not require a Session. It uses the bundled copy of the canonical synthetic query-workflow JSON; a regression test checks exact equality. Plan, candidate and coverage views use existing Q1 types. Search and priority filters preserve producer queue order. Snapshot selection displays absolute recorded counts and does not replace separately assessed coverage. The sample has no paper titles or authors; identifiers and a missing-metadata notice are shown. This entry makes no Remote or model calls and is never a fallback for real results. Candidate adjustments, approval actions and citation expansion await their owner-defined interfaces.

The page consumes complete background snapshots. Only increasing progress and Q6 sequences for the same Session, background task, retrieval run and Brief are accepted; recent history retains 20 observed events. Six stages, concurrent papers, batches, attempts and evidence counts come directly from the producer. A grouped live count view shows discovered records, deduplicated works, selected candidates, available full texts, validated evidence records, included papers and report status; the counts have different units and can still change during execution. Unknown values stay unknown; elapsed time uses the latest observed snapshot, without a completion percentage or ETA. A disconnected subscriber preserves its observations and offers explicit reload without restarting execution.

Approved search previews distinguish direct-search providers from reference-verification providers and show channels, questions and per-query budgets. `hybridRetrieval` is a terminal observation: the viewer renders its five stages and separate URL/reference/work counts without inferring live progress. Missing projections and legacy policies remain explicitly unknown. Candidate identification never implies verification. Report preview and Markdown download preserve server Markdown with `retrievalDisclosureIncluded: true` verbatim; otherwise they append a labeled, escaped retrieval disclosure using the same actual result; quality is unchanged and Web candidate URLs never enter the bibliography.

A draft with an `insufficient_coverage` evaluation issue keeps its Markdown download and displays a localized limited-evidence notice. Blocked final delivery does not hide an existing draft.

The run panel displays insight settlement and reasons separately from extraction and review. `partial_success` retains the report download and rejected candidate paragraph reasons; it does not determine final delivery or assert independent semantic approval. Question answers and gaps appear in Markdown. Failed or blocked synthesis has no report download.

`renderResearchPage()` — Pass an evaluated ResearchReport and explicit zh-CN or en viewer language. The returned HTML contains its own styles and interactions, requires no server or external assets, and escapes report text in markup and embedded JSON. Search filters claims and evidence; evidence links expand their details. Download exports the exact report Markdown. This renderer remains internal. The main Web entry registers through conversation.chat.node and uses framework locale dictionaries.

After a plan is explicitly approved in Chat, the card reads `academicResearch.plan` and saved tasks before admitting one automatic `startBackgroundRun` with the Session, exact approved Brief identity and `synthetic: false`. It waits for the originating turn to complete normally and the framework Session running flag to clear, then rechecks current approval before dispatch. A changed approval cannot execute from an older card; rejected or missing approvals never dispatch. Server-side admission remains authoritative.

Each card filters recovery by its immutable Brief identity. Persisted academic/background-run-state events retain the exact task ID, allowing older cards to recover via getBackgroundRun even when the recent-task list omits them. Reloading or returning to a card reads the saved task rather than creating another. A different active task blocks admission; the waiting card offers an explicit refresh after that task settles, matching the server's one-active-task rule.

Closing, switching Sessions and refreshing dispose observation only; reopening reads the same server-owned task, including its report. Only `cancelBackgroundRun` requests cancellation. Admission-response loss triggers record discovery before another start is allowed. Interrupted tasks retain observations and never resume automatically. Saved results remain viewable if current plan approval is absent. Background completion, processing status, retrieval coverage and report review remain separate producer facts.

Per-paper results distinguish complete, partial and failed extraction. The page shows accepted evidence counts and rejected draft numbers with localized reasons. Draft numbers are displayed starting at one; source indexes remain producer-owned diagnostics. Rejected statements are not displayed as accepted report evidence.

After a completed first-tier report, users may select one extracted paper version with retained evidence and invoke the existing `enhanceEvidence` Remote. A synchronous click guard and durable Session selection prevent duplicate dispatch; reading history must succeed before selection is enabled. The panel reads selection, settlement and verified enhancement fragments through the existing Session follow snapshot and backward pages, scoped to the selected run and version. Supplemental excerpts and actual terminal counts are separate from the unchanged original report. Failed or cancelled enhancement can retain committed excerpts even when the terminal failure count is zero. Missing settlement is unconfirmed, not inferred success or automatic retry. Reopening restores durable facts. Unlike detached background research, closing this panel cancels its enhancement RPC. Enhancement does not regenerate, approve or replace the report, and provides no server progress percentage.

Report issues distinguish delivery blockers from content limitations and unanswered questions. Missing independent review alone does not prevent delivery; ready denotes delivery checks, not semantic approval. Historical reports keep their original status and are not relabeled by the client.

<a id="model-experience"></a>
## Model Experience

### Returned result

#### What the model sees

The standalone renderer `renderResearchPage()` returns data without model requests. The Web form submits the previewed approval identity to the Academic Controller; the workflow owns model prompts and recorded research state.

#### Token effect

Starting research can consume model tokens through the configured workflow. Viewing, filtering and downloading returned data issue no additional model requests.

#### KV Cache effect

This package performs no model cache operations.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The viewer uses AcademicBackgroundRunView and AcademicResearchRunValue directly. It offers explicit subscription reload and server-record recovery, but no automatic retry, checkpoint continuation or Brief approval action. Cancelling is confirmed by server settlement, not by disconnecting a subscriber. User content renders as text. No invariant companion is published because the viewer owns no independently divergent state.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

See the fixed benchmark in the [report development record](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md) and the [stage-settlement decision](../../../.agents/notes/implemented/architecture/2026-09-20-academic-evidence-extraction-recovery.md).

</details>
