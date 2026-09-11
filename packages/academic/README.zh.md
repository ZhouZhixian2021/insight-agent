---
description: "不依赖提供方的学术洞察模型与能力的 academic 分组地图。"
kind: "package-group"
---

# packages/academic

[English](README.md) | 中文

## 概述

academic 分组负责可复用的学术洞察领域类型与能力。产品界面、通用 Web 提供方和提供方专用检索集成仍由其现有模块负责。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`model`](model/README.zh.md) | 共享标识符、记录、结果状态与纯模型辅助函数 | 无服务键 |
| [`source`](source/README.zh.md) | 学术来源访问 seam：提供方注册表、选择与搜索词汇 | `academicSource` |
| [`source-openalex`](source-openalex/README.zh.md) | OpenAlex 学术来源提供方，搜索 `/works` 并规范化进共享模型 | 注入 `academicSource` |
| [`source-crossref`](source-crossref/README.zh.md) | Crossref 学术来源提供方，搜索 `/works` 并规范化进共享模型 | 注入 `academicSource` |
| [`source-arxiv`](source-arxiv/README.zh.md) | arXiv 学术来源提供方，搜索 `/api/query` 并规范化进共享模型 | 注入 `academicSource` |
| [`ingestion`](ingestion/README.zh.md) | 对提供方规范化后的记录进行去重与版本合并 | 无服务键 |
| [`evidence`](evidence/README.zh.md) | 来源定位、证据记录与证据卡片的构造 | 无服务键 |

-----

<a id="related-documentation"></a>
## 相关文档

- [学术洞察子系统](../../docs/subsystems/academic-insight.zh.md)——包所有权与依赖方向。
- [学术来源子系统](../../docs/subsystems/academic-source.zh.md)——学术来源访问 seam 的词汇与选择契约。
- [Academic Model v1 设计](../../z-team_docs/模块分工/academic-model-v1-design.md)——将逐步进入本包的团队已确认字段。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
