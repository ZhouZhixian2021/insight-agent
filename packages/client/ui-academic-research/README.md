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

Approved search previews distinguish direct-search providers from reference-verification providers and show channels, questions and per-query budgets. `hybridRetrieval` is a terminal observation: the viewer renders its five stages and separate URL/reference/work counts without inferring live progress. Missing projections and legacy policies remain explicitly unknown. Candidate identification never implies verification. Report preview and Markdown download preserve the server body and append a labeled, escaped retrieval disclosure using the same actual result; quality is unchanged and Web candidate URLs never enter the bibliography.

A draft with an `insufficient_coverage` evaluation issue keeps its Markdown download and displays a localized limited-evidence notice. Blocked final delivery does not hide an existing draft.

The run panel displays insight settlement and reasons separately from extraction and review. `partial_success` retains the draft download and rejected candidate paragraph reasons; it is not report approval. Question answers and gaps appear in Markdown. Failed or blocked synthesis has no report download.

`renderResearchPage()` — Pass an evaluated ResearchReport and explicit zh-CN or en viewer language. The returned HTML contains its own styles and interactions, requires no server or external assets, and escapes report text in markup and embedded JSON. Search filters claims and evidence; evidence links expand their details. Download exports the exact report Markdown. This renderer remains internal. The main Web entry registers through sidebar.footer.action and uses framework locale dictionaries.

After selecting a model and approving the research plan, open the sidebar entry to preview the topic, questions, and Chinese search directions through `academicResearch.plan`. There is no query field. Start research sends `sessionId`, the previewed `researchBriefId`, `synthetic: false`, and an AbortSignal to `academicResearch.run`. Missing or incomplete plans prompt the user to complete review in chat; a changed approval identity requires reopening the preview. Late preview replies from a disposed form are ignored. Cancellation, dialog close and Session changes abort the owned request; late replies from disposed forms cannot update a different Session. A returned cancellation preserves producer facts; cancellation without a final reply explicitly reports that no server result was received. The page renders the producer's `stages` settlements directly, so a successful search and full-text acquisition remain visible when later evidence extraction fails. Coverage truncation is presented as limited retrieval coverage or an early stop, rather than only a count limit. Pending runs have no progress percentage; null providerBreakdown never becomes invented provider counts. Fixed scenarios live only in tests.

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

- The viewer uses AcademicResearchRunValue directly. It offers no server progress stream, automatic retry, result recovery after closing, or Brief approval action. Cancellation of the carrier does not itself confirm server settlement. User content renders as text. No invariant companion is published because the viewer owns no independently divergent state.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

See the fixed benchmark in the [report development record](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md) and the [stage-settlement decision](../../../.agents/notes/implemented/architecture/2026-09-20-academic-evidence-extraction-recovery.md).

</details>
