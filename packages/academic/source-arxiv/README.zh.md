---
description: "学术来源 seam（ctx.academicSource）的 arXiv 学术来源提供方：搜索公开的 Atom /api/query 端点并把每条条目规范化进共享学术模型。"
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-arxiv

[English](README.md) | 中文

## 概述

`dsh-academic-source-arxiv` 向 `ctx.academicSource` 注册 `arxiv` 提供方，并搜索公开的 arXiv Atom `/api/query` 端点。每条条目在提供方边界被规范化为共享的 `AcademicWork`/`WorkVersion` 对，作为预印本携带 `arxiv` 标识符，并且（在存在 DOI 时）携带 DOI，因此摄取能把它与出版方的正式版本合并。

## 目录

- [使用本包](#use-this-package)
- [API](#api)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

同时加载 seam 与本提供方；未注册其他提供方时，`search()` 会自动选择 `arxiv`。

```yaml
- name: '@deepseek-ai/dsh-academic-source'
- name: '@deepseek-ai/dsh-academic-source-arxiv'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `https://export.arxiv.org` | arXiv export API 基址；会追加 `/api/query`。 |

提供方构造 `GET {baseURL}/api/query?search_query=all:{query}&max_results={maxResults}`，解析 Atom feed，并把每条条目通过 `normalizeArxivWork()` 映射。

-----

<a id="api"></a>
## API

| 导出 | 角色 |
|---|---|
| `ArxivProvider` | 以 id `arxiv` 注册的 `AcademicSourceProvider` 实现。 |
| `ArxivProviderOptions` | 一次搜索使用的已解析端点。 |
| `parseArxivFeed()` | 把 Atom feed 正文解析为提炼后的条目。 |
| `normalizeArxivWork()` | 把一条 arXiv 条目转换为成果/版本对。 |
| `ArxivRawWork` | 规范化器消费的提炼后 arXiv 条目字段。 |

插件入口还导出 `name`、`inject`、`Config` 与 `apply`。

-----

<a id="model-experience"></a>
## 模型体验

间接通过未来把规范化成果渲染进模型可见上下文的检索或工作流消费方体现；本提供方不贡献任何提示词或 schema。

#### KV Cache 影响

无直接失效；消费方负责记录排序与序列化进提示词。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **无重试或退避**——每次搜索只发一次请求；`429` 或 `5xx` 会以 `ACADEMIC_SOURCE_PROVIDER_ERROR` 呈现。
- **无分页**——arXiv 用 `max_results` 限制每次查询；更大的结果集需要基于 `start` 的分页。
- **一律视为预印本**——arXiv 不暴露正式出版版；该关联通过可选 DOI 建立。
- **`available()` 只看端点**——arXiv 无需密钥。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套。本提供方除了已解析的选项外不拥有事件流或可变运行时数据；针对录制 Atom feed 与 stub 化 `fetch` 的聚焦单元测试固定了解析、wire 映射、查询构造与错误码。
