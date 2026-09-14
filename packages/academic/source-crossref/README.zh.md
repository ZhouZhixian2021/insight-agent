---
description: "学术来源 seam（ctx.academicSource）的 Crossref 学术来源提供方：搜索公开 /works 端点并把每条记录规范化进共享学术模型。"
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-crossref

[English](README.md) | 中文

## 概述

`dsh-academic-source-crossref` 向 `ctx.academicSource` 注册 `crossref` 提供方，并搜索公开的 Crossref `/works` 端点。每条返回记录在提供方边界被规范化为共享的 `AcademicWork`/`WorkVersion` 对，携带小写裸 DOI 作为外部标识符，因此摄取能把同一成果的 Crossref 记录与 OpenAlex、arXiv 记录合并。

## 目录

- [使用本包](#use-this-package)
- [API](#api)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

同时加载 seam 与本提供方；未注册其他提供方时，`search()` 会自动选择 `crossref`。

```yaml
- name: '@deepseek-ai/dsh-academic-source'
- name: '@deepseek-ai/dsh-academic-source-crossref'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `https://api.crossref.org` | Crossref API 基址；会追加 `/works`。 |
| `mailto` | （未设置） | 以 `mailto` 查询参数发送的礼貌池联系邮箱。 |

提供方构造 `GET {baseURL}/works?query={query}&rows={maxResults}`，配置后还会附上 `mailto`。每条 `message.items[]` 项都会经过 `normalizeCrossrefWork()`。

-----

<a id="api"></a>
## API

| 导出 | 角色 |
|---|---|
| `CrossrefProvider` | 以 id `crossref` 注册的 `AcademicSourceProvider` 实现。 |
| `CrossrefProviderOptions` | 一次搜索使用的已解析端点与 `mailto`。 |
| `normalizeCrossrefWork()` | 把一条 Crossref 记录转换为成果/版本对。 |
| `CrossrefRawWork` | 规范化器消费的 Crossref `/works` 字段子集。 |
| `CrossrefSearchResponse` | `/works` 搜索响应信封。 |

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
- **无撤回检测**——Crossref 通过 `update-to` 链接暴露撤回，本提供方不解析它。
- **`available()` 只看端点**——Crossref 免费池无需密钥。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套。本提供方除了已解析的选项外不拥有事件流或可变运行时数据；针对录制记录形状与 stub 化 `fetch` 的聚焦单元测试固定了 wire 映射、查询构造与错误码。
