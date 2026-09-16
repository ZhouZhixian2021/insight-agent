---
description: "学术研究报告的 Web 客户端界面：一个客户端插件骨架，内部含 HTML 报告渲染器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-academic-research

[English](README.md) | 中文

## 概述

生成可独立打开的 HTML 报告页，提供证据导航、搜索和 Markdown 下载。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

`renderResearchPage()` — 传入已评测的 ResearchReport 和明确的 zh-CN 或 en 界面语言。返回的 HTML 包含样式与交互，不依赖服务或外部资源，报告文字在 HTML 和嵌入 JSON 中均转义。搜索筛选结论和证据，证据链接展开详情，下载导出原始 Markdown。浏览器半是插件骨架，该渲染器暂为内部辅助函数，待阶段四的研究界面接入。

本包是无状态函数库，不发布 invariant 伴随模块；自动化测试核验输出关联和失败行为。

<a id="model-experience"></a>
## 模型体验

### 返回结果

#### 模型看到的内容

`renderResearchPage()` 仅返回数据，不发送模型请求。

#### Token 影响

无直接消耗。消费方负责后续渲染和记录请求。

#### KV Cache 影响

本包不操作模型缓存。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 不提供实时进度、会话订阅、Brief 审批操作或主 Web 导航入口。这些需要 A 的工作流及后续基于 slot 的客户端插件。用户数据按文字呈现，不作为可执行 Markdown 或 HTML。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文</summary>

固定基准与检查结果见 [中文开发记录](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md)。

</details>
