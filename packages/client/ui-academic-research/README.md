---
description: "Web-client surface for the academic research report: a Session-backed Remote run viewer and an internal HTML report renderer."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-academic-research

English | [中文](README.zh.md)

## Summary

The main Web sidebar starts Academic research in the selected saved Session and displays the formal Remote result, with separate lifecycle, aggregate processing, source-search, full-text, evidence-extraction and report-quality states, coverage, evidence navigation and Markdown download.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The Q6 demo’s “Run lifecycle preview” uses a separate fixed JSON dataset for the phase-one Q7.4 follow-up. It separates viewing connection from running, paused, completed, limited-completion, failed and cancelled states. Closing, reopening or switching preview records retains the same local record and any draft; explicit demo cancellation alone changes cancellation state. Funnel limits are not pass counts, partial usability is not final inclusion, and unknown counts or stage durations stay unknown. Draft downloads use `academic-demo-draft.md`. These controls do not invoke Remote; retained state lasts only within the mounted Web page. The live form uses Session-owned background tasks independently of this preview.

The real run viewer consumes complete Q6 and result projections from `watchBackgroundRun`. It binds Session, run and Brief identity, ignores older Q6 sequences, and retains observed facts on interruption. Formal plan, paper metadata, authoritative queues, rounds and one-based displayed batch numbers reuse the read-only views. Coverage pending, available, truncated and failed states remain distinct. Per-question supporting work IDs, evidence IDs and gaps come directly from the settled coverage; candidate `matchedQuestions` never create evidence support. A final result without Q6 is explicitly unavailable and never falls back to the demo.

The sidebar also offers an explicit “Q6 read-only demo” without requiring a Session. It uses the bundled copy of the canonical synthetic query-workflow JSON; a regression test checks exact equality. Plan, candidate and coverage views use existing Q1 types. Search and priority filters preserve producer queue order. Snapshot selection displays absolute recorded counts and does not replace separately assessed coverage. The sample has no paper titles or authors; identifiers and a missing-metadata notice are shown. This entry makes no Remote or model calls and is never a fallback for real results. Candidate adjustments, approval actions and citation expansion await their owner-defined interfaces.

The page consumes complete background snapshots. Only increasing progress and Q6 sequences for the same Session, background task, retrieval run and Brief are accepted; recent history retains 20 observed events. Six stages, concurrent papers, batches, attempts and evidence counts come directly from the producer. A grouped live count view shows discovered records, deduplicated works, selected candidates, available full texts, validated evidence records, included papers and report status; the counts have different units and can still change during execution. Unknown values stay unknown; elapsed time uses the latest observed snapshot, without a completion percentage or ETA. A disconnected subscriber preserves its observations and offers explicit reload without restarting execution.

Approved search previews distinguish direct-search providers from reference-verification providers and show channels, questions and per-query budgets. `hybridRetrieval` is a terminal observation: the viewer renders its five stages and separate URL/reference/work counts without inferring live progress. Missing projections and legacy policies remain explicitly unknown. Candidate identification never implies verification. Report preview and Markdown download preserve server Markdown with `retrievalDisclosureIncluded: true` verbatim; otherwise they append a labeled, escaped retrieval disclosure using the same actual result; quality is unchanged and Web candidate URLs never enter the bibliography.

A draft with an `insufficient_coverage` evaluation issue keeps its Markdown download and displays a localized limited-evidence notice. Blocked final delivery does not hide an existing draft.

The run panel displays insight settlement and reasons separately from extraction and review. `partial_success` retains the draft download and rejected candidate paragraph reasons; it is not report approval. Question answers and gaps appear in Markdown. Failed or blocked synthesis has no report download.

`renderResearchPage()` — Pass an evaluated ResearchReport and explicit zh-CN or en viewer language. The returned HTML contains its own styles and interactions, requires no server or external assets, and escapes report text in markup and embedded JSON. Search filters claims and evidence; evidence links expand their details. Download exports the exact report Markdown. This renderer remains internal. The main Web entry registers through sidebar.footer.action and uses framework locale dictionaries.

After selecting a model and approving a research plan, open the sidebar entry to preview `academicResearch.plan`. `startBackgroundRun` sends the selected Session, approved Brief identity and `synthetic: false`. Opening the dialog lists saved Session tasks, selects active work or the newest saved record, fetches its full view and watches running work. Users can select earlier records. Closing, switching Sessions and refreshing dispose observation only; reopening reads the same server-owned task, including its report. Only `cancelBackgroundRun` requests cancellation. Admission-response loss triggers record discovery before another start is allowed. Interrupted tasks retain observations and never resume automatically. Saved results remain viewable if current plan approval is absent. Background completion, processing status, retrieval coverage and report review remain separate producer facts.

Per-paper results distinguish complete, partial and failed extraction. The page shows accepted evidence counts and rejected draft numbers with localized reasons. Draft numbers are displayed starting at one; source indexes remain producer-owned diagnostics. Rejected statements are not displayed as accepted report evidence.

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
