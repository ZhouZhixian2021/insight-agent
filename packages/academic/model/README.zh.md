---
description: "供学术洞察包共用的标识符与字段状态类型。"
kind: "package-library"
---

# @deepseek-ai/dsh-academic-model

[English](README.md) | 中文

## 概述

`dsh-academic-model` 负责学术洞察包共用且不依赖提供方的数据语义。它是库，不是 Cordis 服务或插件，也不执行检索、证据抽取、跨论文分析、报告渲染或模型调用。

## 目录

- [使用本包](#use-this-package)
- [API](#api)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

学术业务包应导入这些类型，而不是各自声明提供方专用的替代类型。提供方包和工作流包在各自的包边界把记录转换为本模型。

-----

<a id="api"></a>
## API

| 导出项 | 职责 |
|---|---|
| `AcademicWorkId` | 同一学术成果全部已知表示形式共用的稳定标识。 |
| `WorkVersionId` | 学术成果某个内容版本的不可变标识。 |
| `EvidenceId` | 一张证据卡片的稳定标识。 |
| `ClaimId` | 一条报告论断的稳定标识。 |
| `ResearchBriefId` | 一份已批准研究简报的稳定标识。 |
| `Availability<T>` | 表达可用、来源未知、不适用、尚未抽取和抽取失败的五态结果。 |
| `isAvailable()` | 把类型收窄到含值状态的判定函数。 |
| `PartialDate` | 同时保留年、月或日精度的日期文本。 |
| `ExternalIdentifier` | 同时保存原始值和规范化值的提供方观测记录。 |
| `externalIdentifierDedupKey()` | 根据标识符类型和调用方规范化值生成键。 |
| `AcademicWork` | 跨版本身份、书目信息和规范引用版本。 |
| `WorkVersion` | 带来源、日期、哈希和有效状态的不可变内容版本。 |
| `createAcademicWorkId()` | 创建随机内部成果 ID。 |
| `createWorkVersionId()` | 为不可变内容版本创建随机内部 ID。 |
| `ResearchBrief` | 带版本的研究范围、证据要求、报告要求、停止条件和审核状态。 |
| `createResearchBriefId()` | 为同一研究简报的全部版本创建共用随机内部 ID。 |
| `isExecutableResearchBrief()` | 只接受当前版本已获得明确批准的研究简报。 |
| `EvidenceRecord` | 绑定实际成果版本和来源定位的可追溯原文及带来源陈述。 |
| `SourceLocator` | 分别定位提供方记录、摘要、章节、段落、表格和图片的六种类型。 |
| `EvidenceCard` | 从一个不可变成果版本提取的六个有证据分区。 |
| `EvidenceSnapshot` | 一个 Brief 版本实际使用的证据、成果版本和内容哈希不可变集合。 |

-----

<a id="model-experience"></a>
## 模型体验

通过把这些记录渲染为模型可见上下文的工作流和分析消费者间接影响模型体验。

#### KV Cache 影响

不会直接使缓存失效；记录进入提示词时的顺序和序列化由消费者负责。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **不隐藏规范化**——提供方在请求去重键前规范化标识符值；本包不猜测提供方特定规则。
- **尚无持久去重映射**——去重键规则已经实现，但持久映射记录和合并审计字段仍需单独确认设计。
- **后续记录尚未加入**——论断、覆盖度和批处理结果由成员 A 在后续阶段加入。
- **尚无持久化解析器**——有类型保证的同进程调用方不需要重复运行时校验；持久化阶段会在不可信 JSON 入口执行校验。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布伴随模块。这个纯库不拥有事件流或可变运行时数据；聚焦单元测试负责验证其值语义。
