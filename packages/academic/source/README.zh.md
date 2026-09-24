---
description: "学术来源访问服务（ctx.academicSource）：工作流与后续工具如何通过可替换的提供方搜索学术成果，并共享一套选择策略与错误词汇。"
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source

[English](README.md) | 中文

## 概述

任何学术包都可以通过 `dsh-academic-source`（`ctx.academicSource`）搜索学术 Provider，而无需绑定厂商 API。调用方可以用 `search()` 选择单个 Provider、用 `searchAll()` 聚合配置的 Provider，或用 `searchProviders()` 按请求指定 Provider，再从选中版本解析有序全文候选。服务本身不发起网络请求，也不注册面向模型的工具；网络传输和来源专用解析由 Provider 负责。

## 目录

- [使用本包](#use-this-package)
- [API](#api)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

需要学术搜索的组合会加载服务并挂载至少一个 Provider。使用 `search()` 运行明确选择的后端，或使用 `searchAll()` 以轮询顺序聚合所有可用 Provider。

加载服务后用 `searchProvider` 固定一个提供方，或让唯一挂载的后端自动选择。环境变量 `$DSH_ACADEMIC_SOURCE_SEARCH_PROVIDER` 填充同一字段，不是独立的优先级链。

```yaml
- name: '@deepseek-ai/dsh-academic-source'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `searchProvider` | （未设置） | 固定的搜索提供方 id；未设置时在恰好一个可用时自动选择 |
| `searchProviders` | （未设置） | `searchAll()` 的非空发现提供方 id 列表；未设置时调用所有可用提供方 |
| `searchTimeoutMs` | （未设置） | 正数的单提供方时限；未设置时由调用方控制预算 |

设置 `searchProviders: [openalex]` 可避免发现阶段下载目录，同时保留已挂载目录提供方供 `resolveFullText()` 使用。此列表不会把 OpenAlex 标识符映射成其他提供方的标识符。配置的提供方缺失或不可用时明确失败。设置 `searchTimeoutMs` 可隔离卡住的提供方：服务中止其子信号、记录 `timeout` 失败并保留其他结果。调用方取消仍中止整轮。提供方必须配合取消才能释放底层资源；服务可以停止等待，但无法终止任意提供方代码。

三种搜索方式都会返回规范化成果并执行总 `request.maxResults` 上限。`searchAll()` 使用配置的发现 Provider；未配置时调用全部可用 Provider。`searchProviders(request, providerIds, signal)` 仅搜索请求指定的 ID，不受发现配置影响；空列表、重复 ID、缺失或不可用的 Provider 都在网络请求前失败。多 Provider 搜索在部分来源失败时保留其他成果和来源失败，并报告实际调用列表、上限前记录数、截断状态与来源限制。`resolveFullText()` 会把选中版本的来源记录映射回 Provider 拥有的有序 URL 候选。调用可传入转发给 Provider 的可选 `AbortSignal`。

`verifyReference(reference, allowedProviders, signal)` 把已识别 DOI 交给 OpenAlex、arXiv ID 交给 arXiv、ACL/PMLR/CVF 官方记录交给对应 Provider。服务在网络访问前检查允许列表；即使目录搜索不可用，已注册 Provider 仍可核验单篇记录。结果是带全文候选的已核验成果，或一条分类失败。Provider 未注册时明确抛错；调用方取消会中止调用。

### 提供方选择

每次调用在执行时解析提供方，注册或加载顺序从不影响结果。配置的提供方 id 在已注册且可用时胜出；未配置 id 时，服务运行唯一可用提供方，否则清晰失败：

| 情况 | 结果 |
|---|---|
| 配置 id 已注册且可用 | 运行该提供方 |
| 配置 id 未注册 | `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING` |
| 配置 id 已注册但不可用 | `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE` |
| 无 id，恰好一个已注册可用提供方 | 运行它 |
| 无 id，无可用提供方 | `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE` |
| 无 id，多个可用提供方 | `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS` |

提供方可用性是廉价的本地检查——例如密钥或端点是否就位——绝不发起网络调用，因此选择保持快速且确定。

### 失败与恢复

对于保留下来且带来源记录的成果，`searchAll()` 还在 `limitations` 中报告首次公开日期、场所、版本类型未知的数量，以及全文候选缺失或解析失败的数量。这些是发现限制，不是下载尝试或来源搜索失败；不会伪造 `batch.failures` 或丢弃成功的搜索结果。没有候选不等于论文不存在全文。

`search()` 失败抛出携带稳定、可机读错误码的 `AcademicSourceError`。`searchAll()` 把预期搜索失败转换为来源级 `ProviderFailure` 并保留其他成果。超时、限流、网络和解析错误码对应不同类别；其他预期错误码使用 `upstream_error`。选择/配置错误仍然抛出，调用方取消以 `ACADEMIC_SOURCE_ABORTED` 中止整轮。服务不执行重试或查询规划。

-----

<a id="api"></a>
## API

| 导出 | 角色 |
|---|---|
| `AcademicSourceProvider` | 后端契约：可用性、搜索、来源专用全文 URL 解析，以及可选的已声明覆盖限制。 |
| `AcademicSourceSearchRequest` | 一次学术查询，带可选 `maxResults` 上限。 |
| `AcademicSourceSearchResult` | 规范化成果/版本对，外加 `truncated` 标记。 |
| `AcademicSourceSearchBatchResult` | `searchAll()` 的聚合结果：实际调用的提供方、上限前记录数、成果与来源级失败组成的 `BatchResult`、截断状态与覆盖限制。 |
| `AcademicSourceWork` | 一对 provider 中立的 `{ academicWork, workVersion }`。 |
| `AcademicWebDiscoveryCandidate`、`AcademicReference`、`AcademicReferenceIdentifier` | 从 Web 结果到 DOI、arXiv 及带 ACL/PMLR/CVF 命名空间记录的纯识别边界；有效引用不因同批识别问题被丢弃，被丢弃的候选则保留明确的未识别、格式错误或含糊原因。发现文本绝不作为证据。 |
| `identifyAcademicReferences()` | 从单条 Web 结果的 URL、标题和摘要片段识别引用，不抓取网页；含糊的 DOI 值不进入结果，其他有效引用仍保留。 |
| `AcademicReferenceVerificationOutcome` | 单条引用的已核验成果/全文结果或不含凭据的分类失败；同批其他结果独立保留。 |
| `AcademicSourceError` | 携带稳定、开放式 `code` 的类型化失败。 |
| `AcademicSourceRuntime` | Provider 注册、单源/多源搜索、单条引用核验与全文解析。 |

完整签名见[学术来源子系统](../../../docs/subsystems/academic-source.zh.md)参考。

-----

<a id="model-experience"></a>
## 模型体验

间接通过将来会把规范化成果渲染进模型可见上下文的工作流或检索消费方体现；本服务本身不贡献任何提示词或 schema。

#### KV Cache 影响

无直接失效；消费方负责记录排序与序列化进提示词。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **无网络客户端**——服务只做选择与上限控制；抓取、限流处理与重试属于各提供方实现。
- **搜索请求只携带 `query` 与 `maxResults`**——provider 中立的过滤（`publicationWindow`、成果类型）延后到后端与有驱动的消费方能诚实支持时再加。
- **逐条核验引用**——运行时不搜索未知标识符，也不摄取全文。已核验记录提供候选 URL；下游抓取器负责检查并下载。
- **无检索运行报告**——`searchAll()` 发布批次事实（`providers`、`discoveredRecords`、`BatchResult`、`limitations`），但构造 `RetrievalRun` 与 `CoverageSummary` 仍由工作流消费方负责。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套。本服务除了私有提供方映射外不拥有事件流或可变数据，选择与上限在每次调用时强制执行。针对脚本化提供方的聚焦单元测试固定了注册、选择、截断与错误码。
