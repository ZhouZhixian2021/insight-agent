---
description: "Render a portable HTML report with evidence navigation, search and Markdown download."
kind: "package-library"
---

# @deepseek-ai/dsh-client-ui-academic-research

English | [中文](README.zh.md)

## Summary

Render a portable HTML report with evidence navigation, search and Markdown download.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

`renderResearchPage()` — Pass an evaluated ResearchReport and explicit zh-CN or en viewer language. The returned HTML contains its own styles and interactions, requires no server or external assets, and escapes report text in markup and embedded JSON. Search filters claims and evidence; evidence links expand their details. Download exports the exact report Markdown. This is an artifact renderer, not a mounted Web client plugin.

This stateless library publishes no invariant companion; automated tests verify output relationships and failure behavior.

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

- No live progress, session subscription, Brief approval controls, or main-Web navigation entry. These require A's workflow and a later slot-based client plugin. User data is displayed as text, not executable Markdown or HTML.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

See the fixed benchmark and verification in the [development record](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md)。

</details>
