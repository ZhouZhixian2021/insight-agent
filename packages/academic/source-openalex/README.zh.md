---
description: "将 OpenAlex 记录转换为共享学术模型。"
kind: "package-library"
---

# @deepseek-ai/dsh-academic-source-openalex

[English](README.md) | 中文

## 概述

`dsh-academic-source-openalex` 把 OpenAlex `/works` 记录转换为 `dsh-academic-model` 的共享记录。它是库，不是 Cordis 服务或插件，也不执行网络请求、检索运行、证据抽取或模型调用。

## 目录

- [使用本包](#use-this-package)
- [API](#api)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

学术摄取流程对每条捕获的 OpenAlex 记录调用 `normalizeOpenAlexWork()`，并把返回的 `AcademicWork`/`WorkVersion` 对交给去重与版本合并。OpenAlex 专有字段名只保留在本包内；调用方只收到共享模型记录。

-----

<a id="api"></a>
## API

| 导出项 | 职责 |
|---|---|
| `OpenAlexRawWork` | 本适配器消费的 OpenAlex `/works` 字段子集。 |
| `normalizeOpenAlexWork()` | 把一条记录转换为一个带单一不可变版本的成果。 |
| `NormalizedOpenAlexWork` | 携带共享内部 ID 的成果/版本对。 |

-----

<a id="model-experience"></a>
## 模型体验

通过把这些规范化记录渲染为模型可见上下文的工作流和分析消费者间接影响模型体验。

#### KV Cache 影响

不会直接使缓存失效；记录进入提示词时的顺序和序列化由消费者负责。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **没有网络客户端**——本包只转换捕获的记录；抓取、限流处理和重试随检索增量加入。
- **没有检索运行报告**——共享模型尚未发布 `RetrievalRun`、`CoverageSummary` 和 `ProviderFailure`，本适配器暂不记录运行统计。
- **只做单记录转换**——每条记录生成一个新的成果标识；跨记录的版本关联与去重属于摄取增量。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布伴随模块。这个纯库不拥有事件流或可变运行时数据；针对捕获记录形状的聚焦单元测试负责验证其转换结果。
