---
description: "Web-client surface for the academic research report: a fixed-data run result viewer and an internal HTML report renderer."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-academic-research

English | [中文](README.zh.md)

## Summary

The main Web sidebar exposes Academic research samples: a fixed-data run viewer with separate lifecycle, retrieval and report-quality states, coverage, evidence navigation and Markdown download.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

`renderResearchPage()` — Pass an evaluated ResearchReport and explicit zh-CN or en viewer language. The returned HTML contains its own styles and interactions, requires no server or external assets, and escapes report text in markup and embedded JSON. Search filters claims and evidence; evidence links expand their details. Download exports the exact report Markdown. This renderer remains internal. The main Web entry registers through sidebar.footer.action and uses framework locale dictionaries.

Scenarios cover pending, partial success, success, cancellation, failure, blocked quality and request errors. Cancel only changes the local sample, not a live Session. Pending runs have no progress percentage; null providerBreakdown never becomes invented provider counts.

<a id="model-experience"></a>
## Model Experience

### Returned result

#### What the model sees

`renderResearchPage()` returns data without issuing model requests.

#### Token effect

No direct tokens. Consumers own subsequent rendering and request logging.

#### KV Cache effect

This package performs no model cache operations.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Fixed samples are explicitly synthetic. The official Remote does not yet supply retrievalRun; live requests, server progress, Session recovery and Brief approval are not connected. The local adaptation combines existing Remote types with the shared RetrievalRun. User content renders as text. No independently divergent state requires an invariant companion.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

See the fixed benchmark and verification in the [development record](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md)。

</details>
