---
description: "Generate traceable Chinese Markdown reports with automatic delivery checks and explicit content limits."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-report

English | [中文](README.zh.md)

## Summary

Generate traceable Chinese Markdown reports with automatic delivery checks and explicit content limits.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Direction-layout drafts implement the preset report hierarchy: opening scope/window/date/policies, executive insight, a direction map, per-direction themes and representative works, mechanisms, results, judgments and audience-specific implications, then cross-direction synthesis and question-linked conclusions. Missing components are omitted and collected as methodology coverage limits. Only supplied metadata enters the bibliography; partial dates keep their precision, missing fields remain explicit, and stable DOI/arXiv or safe source URLs accompany titles, authors, venue, publication status and actual/canonical versions. Each analytical paragraph renders once with its scope, uncertainty and evidence; later placements link to that paragraph without repeating its text. Numerical result tables preserve separate conditions and never manufacture a cross-dataset ranking; unavailable verified figures are disclosed, not drawn. Delivery checks remain separate from content limitations and independent semantic approval.

Question-driven arguments place cited excerpts, version/locator identities and model-proposed link explanations beside each retained paragraph. References are grouped as support, opposing findings and background; background is never labeled as direct support. A paragraph without opposing links explicitly leaves other findings unknown. Missing uncertainty is not represented as proof of no limitation. Partial or unanswered questions expose their remaining gaps. Each analytical paragraph renders once; later sections use cross-references and numerical tables link to the paragraph. The evidence appendix groups works by title and versions within each work, preserving original evidence identifiers and locators. Rendering does not reassess evidence or change approval status.

`appendRetrievalDisclosure()` appends escaped, localized observations, limitations and failures while preserving the original Markdown body. `generateReport()` accepts the same optional `retrievalDisclosure`; it does not turn discovery URLs into references or change review eligibility. The workflow supplies completed query observations, approved budgets and failures for both Web and SDK reports. A report with this appendix returns `retrievalDisclosureIncluded: true`, allowing clients to preserve the Markdown without appending duplicate disclosure. Presentation observations are not an authoritative verification ledger or proof of complete coverage.

Question-driven drafts disclose admitted, cited and supporting-work counts separately. Below-Plan supporting-work or full-text counts produce a prominent limited-evidence notice and `unmet_plan` issues. Such drafts remain viewable with blocked final delivery; neither the approved minimums nor citation integrity checks are relaxed.

With validated `synthesis` and observed `coverage`, `generateReport()` renders approved questions, retained paragraphs and numeric citations. Rejected candidate indexes and reasons enter content limitations; rejected prose never enters conclusions or Claims. Affected questions and sections disclose incomplete coverage. Each accepted paragraph renders once. Bibliography and excerpts come from supplied records. Quantity and required structure determine delivery eligibility. Report length is unrestricted; historical targetLength fields do not block delivery. Partial answers, direction gaps and rejected candidate notices remain nonblocking content limitations; none imply semantic approval.

`generateReport()` — Pass shared model records, work bibliography, draft/final/auto mode, a synthetic-data flag and limitations. Evaluation runs inside report generation. An optional synchronous observer receives `evaluation` before quality checks and `rendering` before Markdown assembly; observer failures do not change report generation. Auto selects final after delivery checks pass, otherwise draft; explicit final rejects failed delivery checks or synthetic data. Missing independent semantic reviews do not block delivery. Markdown separates delivery blockers from content limitations and unanswered questions. Source excerpts, evidence IDs, actual versions and citation versions remain inspectable. Markdown content is escaped and only HTTP(S) source links are active.

No invariant companion is published because this library is stateless; automated tests verify output relationships and failure behavior.

Question-driven reports include an approved-question/evidence check table. Optional `ReportInput.questionLinks` comes from extraction; the table separates those associations, immutable abstract/full-text levels, model answer proposals and unreviewed content. Missing associations are disclosed instead of inferred from model question indexes. Empty card sections do not establish enhanced extraction and neither grant nor rule out final delivery. Zero cited evidence rejects synthesis report generation; evidence counts below the approved minimums retain a visibly limited draft under the approved policy. This renderer does not schedule second-level extraction or provide an independent semantic reviewer.

<a id="model-experience"></a>
## Model Experience

### Returned result

#### What the model sees

`generateReport()` returns data without issuing model requests.

#### Token effect

No direct tokens. Consumers own subsequent rendering and request logging.

#### KV Cache effect

This package performs no model cache operations.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- Chinese supported Plan sections and numeric citations; no PDF/DOCX or semantic review service. The caller discloses synthetic data honestly. This is not a Session workflow or a publication-approval service.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

See the fixed benchmark and verification in the [development record](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md)。

</details>
