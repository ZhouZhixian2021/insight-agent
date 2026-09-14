---
description: "学术来源 seam（ctx.academicSource）的 OpenAlex 学术来源提供方：搜索公开 /works 端点并把每条记录规范化进共享学术模型。"
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-openalex

[English](README.md) | 中文

## 概述

`dsh-academic-source-openalex` 向 `ctx.academicSource` 注册 `openalex` 提供方，并搜索公开的 OpenAlex `/works` 端点。每条返回记录在提供方边界被规范化为共享的 `AcademicWork`/`WorkVersion` 对，因此 seam 及其未来消费方永远看不到 OpenAlex 专有字段名。HTTP 请求与 wire 映射归提供方所有；选择、取消转发与 `maxResults` 上限归 seam 所有。

## 目录

- [使用本包](#use-this-package)
- [API](#api)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

同时加载 seam 与本提供方；未注册其他提供方时，`search()` 会自动选择 `openalex`。

```yaml
- name: '@deepseek-ai/dsh-academic-source'
- name: '@deepseek-ai/dsh-academic-source-openalex'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `https://api.openalex.org` | OpenAlex API 基址；会追加 `/works`。 |
| `mailto` | （未设置） | 以 `mailto` 查询参数发送的礼貌池联系邮箱。 |
| `apiKey` | （未设置） | 以 `api_key` 查询参数发送的付费池 API 密钥。 |

提供方构造 `GET {baseURL}/works?search={query}&per-page={min(maxResults,200)}`，配置后还会附上 `mailto` 与 `api_key`。每条 `results[]` 项都会经过 `normalizeOpenAlexWork()`。`available()` 只检查解析后的端点是否可解析——免费池无需密钥。

-----

<a id="api"></a>
## API

| 导出 | 角色 |
|---|---|
| `OpenAlexProvider` | 以 id `openalex` 注册的 `AcademicSourceProvider` 实现。 |
| `OpenAlexProviderOptions` | 一次搜索使用的已解析端点、`mailto` 与 `apiKey`。 |
| `OpenAlexSearchResponse` | 本提供方消费的 `/works` 搜索响应信封。 |
| `normalizeOpenAlexWork()` | 把一条 OpenAlex 记录转换为成果/版本对。 |
| `OpenAlexRawWork` | 规范化器消费的 OpenAlex `/works` 字段子集。 |
| `NormalizedOpenAlexWork` | 携带共享内部 ID 的成果/版本对。 |

插件入口还导出 `name`、`inject`、`Config` 与 `apply`。

-----

<a id="model-experience"></a>
## 模型体验

间接通过未来把规范化成果渲染进模型可见上下文的检索或工作流消费方体现；本提供方不贡献任何提示词或 schema。

#### KV Cache 影响

无直接失效；消费方负责记录排序与序列化进提示词。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **无重试或退避**——每次搜索只发一次请求；`429` 或 `5xx` 会以携带 HTTP 状态码的 `ACADEMIC_SOURCE_PROVIDER_ERROR` 呈现，限流与重试策略延后。
- **无分页**——`per-page` 受上游 `200` 上限约束；更大的结果集需要后续的分页增量。
- **无运行报告**——在检索或工作流消费方使其对模型可见之前，搜索请求不会作为会话事件记录。
- **`available()` 只看端点**——OpenAlex 免费池无需密钥，因此可用性不反映缺失的 `apiKey`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套。本提供方除了已解析的选项外不拥有事件流或可变运行时数据；针对录制记录形状与 stub 化 `fetch` 的聚焦单元测试固定了 wire 映射、查询构造与错误码。
