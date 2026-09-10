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
| [`source-openalex`](source-openalex/README.zh.md) | 将 OpenAlex 记录转换为共享学术模型 | 无服务键 |

-----

<a id="related-documentation"></a>
## 相关文档

- [学术洞察子系统](../../docs/subsystems/academic-insight.zh.md)——包所有权与依赖方向。
- [Academic Model v1 设计](../../z-team_docs/模块分工/academic-model-v1-design.md)——将逐步进入本包的团队已确认字段。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
