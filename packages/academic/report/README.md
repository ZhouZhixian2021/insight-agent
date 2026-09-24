---
description: "Generate a traceable Chinese Markdown draft and gate final reports on current evidence and reviews."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-report

English | [中文](README.zh.md)

## Summary

Generate a traceable Chinese Markdown draft and gate final reports on current evidence and reviews.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

`appendRetrievalDisclosure()` appends escaped, localized observations, limitations and failures while preserving the original Markdown body. `generateReport()` accepts the same optional `retrievalDisclosure`; it does not turn discovery URLs into references or change review eligibility. The main Web consumer supplies terminal facts for preview and export. Workflow-generated reports currently omit this optional input, so headless delivery requires owner integration before it carries the same detailed disclosure. Presentation observations are not an authoritative verification ledger or proof of complete coverage.

Question-driven drafts disclose admitted, cited and supporting-work counts separately. Below-Plan supporting-work or full-text counts produce a prominent limited-evidence notice and `unmet_plan` issues. Such drafts remain viewable with blocked final delivery; neither the approved minimums nor citation integrity checks are relaxed.

With validated `synthesis` and observed `coverage`, `generateReport()` renders approved questions, retained paragraphs and numeric citations. Rejected candidate indexes and reasons enter limitations and `unmet_plan` issues; rejected prose never enters conclusions, Claims or body length. Affected questions and sections disclose incomplete coverage. Each accepted paragraph renders once, excluding headings, citations, appendix and repetitions from body length. Bibliography and excerpts come from supplied records. Partial recovery does not satisfy Plan or grant semantic review; synthesis remains draft-only.

`generateReport()` — Pass shared model records, work bibliography, explicit draft/final mode, a synthetic-data flag and limitations. Evaluation runs inside report generation. Drafts expose failed checks and pending semantic review; final mode rejects non-ready evaluation and synthetic data. Source excerpts, evidence IDs, actual versions and citation versions remain inspectable. Markdown content is escaped and only HTTP(S) source links are active.

No invariant companion is published because this library is stateless; automated tests verify output relationships and failure behavior.

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
