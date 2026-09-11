---
description: "学术来源访问服务（ctx.academicSource）：工作流与后续工具如何通过可替换的提供方搜索学术成果，并共享一套选择策略与错误词汇。"
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source

[English](README.md) | 中文

## 概述

任何学术包都可以通过 `dsh-academic-source`（`ctx.academicSource`）搜索学术提供方，而无需绑定任何厂商 API。提供方作为后端接入，服务在每次搜索时挑选一个可用提供方，调用方无需关心背后是哪家厂商。服务本身不发起网络请求，也不注册面向模型的工具：必须先挂载提供方，搜索才能运行；其成果所携带的共享 `Availability<T>` 字段支撑起保留下来的不确定性。一套选择策略、一套取消与错误词汇、一处配置入口，让「这个 harness 如何到达学术来源」只有一个所有者。

## 目录

- [使用本包](#use-this-package)
- [API](#api)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

需要学术搜索的组合会加载 `dsh-academic-source` 服务并挂载至少一个后端，然后直接调用 `ctx.academicSource.search()`。服务在每次调用时解析后端，因此除非调用方配置了提供方 id，否则永远看不到它。

加载服务后用 `searchProvider` 固定一个提供方，或让唯一挂载的后端自动选择。环境变量 `$DSH_ACADEMIC_SOURCE_SEARCH_PROVIDER` 填充同一字段，不是独立的优先级链。

```yaml
- name: '@deepseek-ai/dsh-academic-source'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `searchProvider` | （未设置） | 固定的搜索提供方 id；未设置时在恰好一个可用时自动选择 |

`search()` 运行一次查询并返回规范化成果列表；服务通过截断 `works[]` 并设置 `truncated` 来强制执行 `request.maxResults`。调用可传入可选的 `AbortSignal`，它会转发给提供方。

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

失败抛出 `AcademicSourceError`，携带稳定、可机读的错误码；消息补充细节，例如缺失的提供方 id 或存在歧义的候选集。调用方按错误码路由并决定如何降级。

-----

<a id="api"></a>
## API

| 导出 | 角色 |
|---|---|
| `AcademicSourceProvider` | 后端契约：`id`、`available()` 与 `search(request, signal)`。 |
| `AcademicSourceSearchRequest` | 一次学术查询，带可选 `maxResults` 上限。 |
| `AcademicSourceSearchResult` | 规范化成果/版本对，外加 `truncated` 标记。 |
| `AcademicSourceWork` | 一对 provider 中立的 `{ academicWork, workVersion }`。 |
| `AcademicSourceError` | 携带稳定、开放式 `code` 的类型化失败。 |
| `AcademicSourceRuntime` | `ctx.academicSource` 服务：注册与选择。 |

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
- **无按标识符抓取操作**——按 DOI 或提供方 id 定位单一成果是另一项未来操作，不会塞进 `search()`。
- **无检索运行报告**——共享模型尚未发布 `RetrievalRun`、`CoverageSummary`、`ProviderFailure` 与 `BatchResult`，因此本 seam 不记录运行统计，失败仅通过 `AcademicSourceError` 呈现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套。本服务除了私有提供方映射外不拥有事件流或可变数据，选择与上限在每次调用时强制执行。针对脚本化提供方的聚焦单元测试固定了注册、选择、截断与错误码。
