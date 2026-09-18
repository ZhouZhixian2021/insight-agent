---
description: "Web-client surface for the academic research report: a Session-backed Remote run viewer and an internal HTML report renderer."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-academic-research

English | [中文](README.zh.md)

## Summary

The main Web sidebar starts Academic research in the selected saved Session and displays the formal Remote result, with separate lifecycle, retrieval and report-quality states, coverage, evidence navigation and Markdown download.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

`renderResearchPage()` — Pass an evaluated ResearchReport and explicit zh-CN or en viewer language. The returned HTML contains its own styles and interactions, requires no server or external assets, and escapes report text in markup and embedded JSON. Search filters claims and evidence; evidence links expand their details. Download exports the exact report Markdown. This renderer remains internal. The main Web entry registers through sidebar.footer.action and uses framework locale dictionaries.

After selecting a model and approving the Research Brief plan, enter one query per line in the multiline field: up to three queries, subject to the approved plan. Internal newlines remain in the existing query string; the Controller owns query parsing and the approved limit. The entry calls ctx.remote.academicResearch.run with sessionId, the trimmed query, synthetic: false and an AbortSignal. Cancellation, dialog close and Session changes abort the owned request; late replies from disposed forms cannot update a different Session. A returned cancellation preserves producer facts; cancellation without a final reply explicitly reports that no server result was received. Coverage truncation is presented as limited retrieval coverage or an early stop, rather than only a count limit. Pending runs have no progress percentage; null providerBreakdown never becomes invented provider counts. Fixed scenarios live only in tests.

<a id="model-experience"></a>
## Model Experience

### Returned result

#### What the model sees

The standalone renderer `renderResearchPage()` returns data without model requests. The Web form submits the query to the Academic Controller; the workflow owns model prompts and recorded research state.

#### Token effect

Starting research can consume model tokens through the configured workflow. Viewing, filtering and downloading returned data issue no additional model requests.

#### KV Cache effect

This package performs no model cache operations.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The viewer uses AcademicResearchRunValue directly. It offers no server progress stream, automatic retry, result recovery after closing, or Brief approval action. Cancellation of the carrier does not itself confirm server settlement. User content renders as text. No independently divergent state requires an invariant companion.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

See the fixed benchmark and verification in the [development record](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md)。

</details>
