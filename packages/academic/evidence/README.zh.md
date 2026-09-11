---
description: "学术证据：来源定位、证据记录与证据卡片的构造，并带有等级-定位校验。"
kind: "package-library"
---

# @deepseek-ai/dsh-academic-evidence

[English](README.md) | 中文

## 概述

`dsh-academic-evidence` 从共享学术模型构造来源定位、证据记录与证据卡片，铸造身份并强制执行类型系统无法表达的约束：记录的证据等级必须与其定位类型匹配。它是库，不是 Cordis 服务或插件，也不执行检索、抽取或模型调用。

## 目录

- [使用本包](#use-this-package)
- [API](#api)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

检索增量先从检索到的材料构造定位，再构造一条按 id 引用该定位的记录，最后构造一张把记录归入六个分区的卡片。

```text
const locator = createSourceLocator({ kind: 'paragraph', workVersionId, paragraphNumber: 4 })
const record = createEvidenceRecord({
  academicWorkId, workVersionId, level: 'fulltext', sourcedStatement: '...',
  sourceLocator: locator, verbatimExcerpt: { status: 'available', value: '...' },
  sourceProvider: 'arxiv', sourceUrl: '...', retrievedAt: '...',
  contentHash: { status: 'available', value: '<sha>' }, extractionMethod,
})
const card = createEvidenceCard({ academicWorkId, workVersionId,
  researchQuestions: [{ statement: '...', evidenceIds: [record.evidenceId], questionType: { status: 'available', value: 'causal' } }],
  methods: [], datasets: [], metrics: [], findings: [], limitations: [] })
```

当记录等级与定位不一致、陈述或来源字段为空、或卡片条目未引用任何证据时，构造会以 `EvidenceError` 清晰地失败。

-----

<a id="api"></a>
## API

| 导出 | 角色 |
|---|---|
| `createSourceLocator()` | 构造六种定位变体之一，附带全新身份。 |
| `createEvidenceRecord()` | 构造记录，校验等级-定位配对与非空字段。 |
| `createEvidenceCard()` | 构造卡片，附带全新条目身份并逐条校验。 |
| `SourceLocatorInput` | 六种构造输入，每种定位类型一个。 |
| `EvidenceRecordInput` / `EvidenceCardInput` | 记录与卡片的构造输入。 |
| `EvidenceError` | 携带稳定 `code` 的类型化构造失败。 |

-----

<a id="model-experience"></a>
## 模型体验

间接通过把证据记录与卡片渲染进模型可见上下文的分析或报告消费方体现；本库不贡献任何提示词或 schema。

#### KV Cache 影响

无直接失效；消费方负责记录排序与序列化进提示词。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **无抽取**——本库从调用方提供的陈述与片段构造记录；产生它们的检索/全文抽取是后续增量。
- **无片段-哈希存在性规则**——记录校验等级/定位/来源，但不要求 `abstract`/`fulltext` 有 `available` 片段、或 `fulltext` 有哈希；这些规则等待抽取增量。
- **无运行报告**——构造记录或卡片不记录任何 `RetrievalRun` 或覆盖统计。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套。这个纯库不拥有事件流或可变运行时数据；聚焦单元测试固定定位构造、等级-定位校验、空字段拒绝与卡片条目校验。
