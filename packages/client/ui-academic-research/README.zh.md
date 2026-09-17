---
description: "学术研究报告的 Web 客户端界面：固定数据运行结果页面与内部 HTML 报告渲染器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-academic-research

[English](README.md) | 中文

## 概述

在主 Web 侧栏提供“学术研究样例”入口，展示固定返回结果的运行状态、检索状态、报告质量、覆盖统计与证据，支持场景切换和 Markdown 下载。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

`renderResearchPage()` — 传入已评测的 ResearchReport 和明确的 zh-CN 或 en 界面语言。返回的 HTML 包含样式与交互，不依赖服务或外部资源，报告文字在 HTML 和嵌入 JSON 中均转义。搜索筛选结论和证据，证据链接展开详情，下载导出原始 Markdown。该渲染器继续作为内部辅助函数。主 Web 通过 sidebar.footer.action 注册样例入口，并使用框架 locale 字典。

样例场景为运行中、部分成功、成功、取消、失败、质量阻止交付和请求异常。取消仅切换本地样例，不中止真实 Session；运行中不显示进度百分比，providerBreakdown 为 null 时不生成逐来源计数。

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

- 固定样例始终明确标注为合成数据。正式 Remote 尚未提供 retrievalRun，暂不连接真实请求、服务器进度、Session 恢复或 Brief 审批；页面局部类型只组合现有 Remote 类型和共享 RetrievalRun。用户内容按文字显示。没有独立分歧状态需要 invariant 伴随模块。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文</summary>

固定基准与检查结果见 [中文开发记录](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md)。

</details>
