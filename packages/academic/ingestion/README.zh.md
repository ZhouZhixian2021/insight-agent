---
description: "学术摄取：对提供方规范化后的记录进行去重与版本合并。"
kind: "package-library"
---

# @deepseek-ai/dsh-academic-ingestion

[English](README.md) | 中文

## 概述

`dsh-academic-ingestion` 把提供方规范化的 `AcademicWork`/`WorkVersion` 记录去重为稳定的成果身份，并合并它们的版本。它是库，不是 Cordis 服务或插件，也不执行网络请求或模型调用。精确的外部标识符冲突会自动合并；没有共享标识符、仅靠标题/作者/年份碰撞的情况会作为疑似重复上报，绝不自动合并。

## 目录

- [使用本包](#use-this-package)
- [API](#api)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

学术检索把每条捕获的记录通过 `ingestWorks()` 送入调用方持有的 `IngestIndex`。索引把外部标识符键与模糊键链接到已分配的 `AcademicWorkId`，因此同一成果在跨提供方搜索与跨记录之间保持同一身份；需要持久化的部署自行序列化该索引。

```text
// First search returns a preprint and its published version:
const first = ingestWorks(createIngestIndex(), recordsFromFirstSearch)

// A later search returns another version of the same DOI:
const second = ingestWorks(first.index, recordsFromSecondSearch)
```

每次结果都报告去重后的成果、重新指向身份的版本，以及记录新建、合并或疑似重复的审计。

-----

<a id="api"></a>
## API

| 导出 | 角色 |
|---|---|
| `IngestRecord` | 一对提供方产出的 `{ academicWork, workVersion }`。 |
| `IngestIndex` | 内存中的去重与合并状态。 |
| `createIngestIndex()` | 创建空索引。 |
| `ingestWorks()` | 把一批记录去重进索引并返回结果。 |
| `IngestOutcome` | 更新后的索引、去重成果与版本，以及审计。 |
| `dedupKeys()` | 为单个成果派生精确键与模糊键。 |
| `selectCanonicalVersion()` | 按类型与日期挑选规范版本。 |
| `reconcileWork()` | 把一个成果的多条记录调和为单个 `AcademicWork`。 |
| `IngestAudit` / `IngestAuditEntry` | 可追溯的逐条决策。 |

-----

<a id="model-experience"></a>
## 模型体验

间接通过把去重成果渲染进模型可见上下文的检索或工作流消费方体现；本库不贡献任何提示词或 schema。

#### KV Cache 影响

无直接失效；消费方负责记录排序与序列化进提示词。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **无持久化**——索引在内存中；需要持久化的调用方自行序列化它。持久映射记录与合并审计字段需单独确认设计。
- **模糊匹配只上报**——标题/作者/年份碰撞会作为 `suspected_duplicate` 上报，绝不自动合并；同一批内仅共享模糊键的版本保持分离。
- **首个精确键去重**——记录的外部标识符按字段顺序检查，首个碰撞生效；一条会按不同标识符匹配多个成果的记录不会被拆分。
- **`firstPublicDate` 按字典序**——最早可用的 ISO 字符串胜出；混合年/日精度按文本比较，而非解析。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套。这个纯库不拥有事件流或可变运行时数据；索引是进出传递的不可变值，聚焦单元测试固定去重、合并与规范版本选择行为。
