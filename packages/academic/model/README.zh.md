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

`ProviderFailure` 保存不依赖提供方的错误分类、重试资格和可空的绝对 UTC 重试时间。`createFailureId()` 创建与失败态 `Availability` 共用的标识。`createBatchResult()` 同时保留成功项和错误：没有错误时，即使零结果也为成功；成功项和错误并存时为部分成功；只有错误时为失败。它复制输入数组，但不复制数组中的对象。

`CoverageSummary` 保存实际统计和覆盖限制。`createCoverageSummary()` 拒绝非非负安全整数的计数，以及没有非空白限制说明的截断结果。它复制限制说明数组，不估算统计值。`providerBreakdown` 为 null，表示没有提供数据源分项统计。这些函数不执行重试、不解析不可信 JSON，也不批准报告发布。

`RetrievalRun` 把一次运行绑定到确定的研究简报版本，并保留实际查询、去重后的提供方名称、纳入的成果 ID、覆盖统计和失败。`createRetrievalRunId()` 创建独立运行标识。`ResearchStage` 包含六个生命周期值。规划、等待批准和运行中的记录，其结果状态与结束时间均为 null；完成、失败和取消的记录必须提供这两项。生命周期与结果分开：完成时可以部分成功，取消时仍保留成功项。共享类型不执行批准校验、阶段流转或检索，这些职责属于工作流。

`ClaimRecord` 保存结论、适用范围、有理由的置信等级和不可变证据快照。`ClaimEvidenceLink` 区分支持、反对与背景；`ClaimAssessment` 保存消费者产生的评审及其方法和版本。每种记录都有独立品牌 ID 和结构版本。消费者校验关联存在性和语义支撑，本模型不把背景关系解释为证明。

`checkClaimFreshness(claim, currentBrief, currentEvidence)` 读取以 EvidenceId 为键的当前证据映射。仅当 Brief 身份/版本、证据身份、成果版本和非空白内容哈希全部一致时返回 current。已知差异或已存储的 stale Claim 返回 stale；证据缺失、空快照或哈希不可用返回 unverifiable。已知变化优先，同时保留全部原因。函数不改写历史。stale 和 unverifiable 均不能直接进入最终报告；current 仅通过当前性检查，不代表批准发布。

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
- **不执行分析或语义评审**——消费者产生论断、关联和评估；证据版本一致不证明结论正确。
- **尚无持久化解析器**——有类型保证的同进程调用方不需要重复运行时校验；持久化阶段会在不可信 JSON 入口执行校验。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布伴随模块。这个纯库不拥有事件流或可变运行时数据；聚焦单元测试负责验证其值语义。
