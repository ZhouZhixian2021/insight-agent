---
description: "学术洞察研究能力、后台调度、浏览器页面与配置组合的 academic 分组地图。"
kind: "package-group"
---

# packages/academic

[English](README.md) | 中文

## 概述

academic 分组将研究逻辑、后台调度、浏览器页面和配置组合集中在一个目录中。各包保留独立公开接口及 Host 或 Client 构建，使用方既可复用单项能力，也可选择完整学术接入包。公共 Harness 服务仍由各自的框架分组负责。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`bundle`](bundle/README.zh.md) | 学术配置组合、默认参数和研究技能 | 无服务键 |
| [`research-controller`](research-controller/README.zh.md) | 计划审批、后台研究、恢复和页面调用接口 | `academicResearchController` |
| [`client-remote`](client-remote/README.zh.md) | 通过公共 Remote 传输登记学术浏览器接口 | `remote.academicResearch` |
| [`ui-research`](ui-research/README.zh.md) | 研究计划、进度、证据、报告与追踪视图 | 浏览器插件 |
| [`workflow`](workflow/README.zh.md) | 全文到证据的哈希交接与单篇暂停 | 无服务键 |
| [`model`](model/README.zh.md) | 共享标识符、记录、结果状态与纯模型辅助函数 | 无服务键 |
| [`analysis`](analysis/README.zh.md) | 证据输入准备与注明论文归属的跨论文对比 | 无服务键 |
| [`eval`](eval/README.zh.md) | 证据关联与明确语义审核的交付资格检查 | 无服务键 |
| [`report`](report/README.zh.md) | 经评测的 Markdown 草稿与最终交付检查 | 无服务键 |
| [`source`](source/README.zh.md) | 学术来源访问 seam：Provider 注册、单源/多源搜索与全文解析 | `academicSource` |
| [`source-arxiv`](source-arxiv/README.zh.md) | arXiv 学术来源提供方，搜索 `/api/query` 并规范化进共享模型 | 注入 `academicSource` |
| [`source-openalex`](source-openalex/README.zh.md) | OpenAlex 检索、学术元数据与全文位置 | 注入 `academicSource` |
| [`source-cvf`](source-cvf/README.zh.md) | CVF Open Access 目录与 PDF Provider | 注入 `academicSource` |
| [`source-acl`](source-acl/README.zh.md) | ACL Anthology 目录与 PDF Provider | 注入 `academicSource` |
| [`source-browser`](source-browser/README.zh.md) | 通过 DSH Playwright 搜索已配置网站的可选 Provider | 注入 `academicSource` |
| [`source-pmlr`](source-pmlr/README.zh.md) | PMLR 目录与 PDF Provider | 注入 `academicSource` |
| [`ingestion`](ingestion/README.zh.md) | 对提供方规范化后的记录进行去重与版本合并 | 无服务键 |
| [`retrieval`](retrieval/README.zh.md) | 经审核的查询、已核验候选与可解释排序 | 无服务键 |
| [`evidence`](evidence/README.zh.md) | 来源定位、证据记录与证据卡片的构造 | 无服务键 |

-----

<a id="related-documentation"></a>
## 相关文档

- [学术洞察子系统](../../docs/subsystems/academic-insight.zh.md)——包所有权与依赖方向。
- [学术来源子系统](../../docs/subsystems/academic-source.zh.md)——学术来源访问 seam 的词汇与选择契约。
- [Academic Model v1 设计](../../z-team_docs/学术洞察/模块分工/academic-model-v1-design.md)——将逐步进入本包的团队已确认字段。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

[目录组织决策](../../.agents/notes/implemented/architecture/2026-11-04-academic-workspace-group.zh.md)说明包边界以及页面迁移后仍执行的检查。[团队代码导航](../../z-team_docs/学术洞察/01-代码导航.md)列出实现入口。

</details>
