---
description: "搜索已配置的 PMLR 论文集，并把每篇命中论文解析到官方 PDF。"
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-pmlr

[English](README.md) | 中文

## 概述

本包把 PMLR 论文接入 `ctx.academicSource`。它搜索已配置的官方论文集页面、规范化命中论文，并把规范 PDF 交给共享 evidence 流程。

`verifyReference()` 按论文集/论文 ID 读取单篇官方摘要页，并核对页面的引用 URL。页面给出的 PDF 位置可能不同于推导路径，因此保存在有容量限制的缓存中；未配置论文集目录也可核验，且不会下载 PDF。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 `dsh-academic-source` 之后挂载本包，并列出当前部署需要搜索的 PMLR 论文集页面。

```yaml
- name: '@deepseek-ai/dsh-academic-source-pmlr'
  config:
    catalogUrls: ['https://proceedings.mlr.press/v267/']
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `https://proceedings.mlr.press` | 用于解析论文 PDF 的基址。 |
| `catalogUrls` | `[]` | 官方 PMLR 论文集页面；空列表会使 Provider 不可用。 |
| `maxCachedRecords` | `100` | 内存中保留的已核验论文 PDF 位置数量。 |

完整字段见生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-academic-source-pmlr)。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Provider 复用共享目录抓取、过滤和规范化助手。专用解析器提取每篇论文块与摘要路径；Provider 再推导对应的规范 PDF 路径。Provider 通过 `limitations` 字段声明其仅覆盖配置目录的限制，由 `searchAll()` 呈现。去重与正文解析仍由 `academic-ingestion` 和 `academic-evidence` 负责。

</details>

-----

<a id="model-experience"></a>
## 模型体验

本包仅通过学术研究工作流间接影响模型，不增加提示词或模型 schema。

#### KV Cache 影响

不会直接失效；排序与提示词序列化由工作流负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 只搜索已配置论文集页面，不进行全站爬取。
- 每次搜索都会抓取页面；仅在实测流量需要时增加缓存。
- 页面标记变化时可能需要小范围更新解析器。

<a id="dev-note"></a>
### 开发备注

本提供方不发布 invariant 伴随模块，因为它没有独立维护的运行时观测；聚焦测试检查目录解析和结果映射。
