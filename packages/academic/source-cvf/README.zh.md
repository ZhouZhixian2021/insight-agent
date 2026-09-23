---
description: "搜索已配置的 CVF Open Access 会议目录，并把每篇命中论文解析到官方 PDF。"
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-cvf

[English](README.md) | 中文

## 概述

本包把 CVF Open Access 论文接入 `ctx.academicSource`。它搜索已配置的官方会议页面、规范化命中论文，并把官方 PDF 交给共享 evidence 流程。

`verifyReference()` 读取单篇官方页面（含 workshop 路径），并检查引用元数据中的 PDF URL 与论文 ID 是否对应。未配置会议目录也可核验；此操作不下载 PDF。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 `dsh-academic-source` 之后挂载本包，并列出当前部署需要搜索的 CVF 会议页面。

```yaml
- name: '@deepseek-ai/dsh-academic-source-cvf'
  config:
    catalogUrls: ['https://openaccess.thecvf.com/CVPR2025?day=all']
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `catalogUrls` | `[]` | 官方 CVF 会议目录页；空列表会使 Provider 不可用。 |

完整字段见生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-academic-source-cvf)。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Provider 通过共享目录助手抓取配置页面。专用解析器提取标题链接、作者和会议信息；Provider 再把 `/html/*.html` 记录地址转换为对应的 `/papers/*.pdf` 地址。Provider 通过 `limitations` 字段声明其仅覆盖配置目录的限制，由 `searchAll()` 呈现。去重与正文解析仍由 `academic-ingestion` 和 `academic-evidence` 负责。

</details>

-----

<a id="model-experience"></a>
## 模型体验

本包仅通过学术研究工作流间接影响模型，不增加提示词或模型 schema。

#### KV Cache 影响

不会直接失效；排序与提示词序列化由工作流负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 只搜索已配置目录页，不进行全站爬取。
- 每次搜索都会抓取页面；仅在实测流量需要时增加缓存。
- 页面标记变化时可能需要小范围更新解析器。

<a id="dev-note"></a>
### 开发备注

本提供方不发布 invariant 伴随模块，因为它没有独立维护的运行时观测；聚焦测试检查目录解析和结果映射。
