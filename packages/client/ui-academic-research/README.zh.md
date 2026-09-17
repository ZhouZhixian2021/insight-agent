---
description: "学术研究报告的 Web 客户端界面：真实会话研究运行页面与内部 HTML 报告渲染器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-academic-research

[English](README.md) | 中文

## 概述

主 Web 侧栏在当前已保存会话中发起学术研究，展示正式 Remote 返回的运行状态、检索状态、报告质量、覆盖统计、证据及 Markdown 下载。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

`renderResearchPage()` — 传入已评测的 ResearchReport 和明确的 zh-CN 或 en 界面语言。返回的 HTML 包含样式与交互，不依赖服务或外部资源，报告文字在 HTML 和嵌入 JSON 中均转义。搜索筛选结论和证据，证据链接展开详情，下载导出原始 Markdown。该渲染器继续作为内部辅助函数。主 Web 通过 sidebar.footer.action 注册研究入口，并使用框架 locale 字典。

请先在当前会话选择模型并完成 Research Brief 的 Plan 审核，再输入查询。入口调用 ctx.remote.academicResearch.run，传递 sessionId、去除首尾空格的 query、synthetic: false 和 AbortSignal。取消、关闭页面及切换会话均中止本次请求；已卸载表单的迟到响应不能更新其他会话。服务器返回取消结果时保留实际成果；取消后未收到最终响应则明确提示，不伪造服务器完成状态。运行中不显示进度百分比，providerBreakdown 为 null 时不生成逐来源计数。固定场景仅用于测试。

<a id="model-experience"></a>
## 模型体验

### 返回结果

#### 模型看到的内容

独立渲染器 `renderResearchPage()` 仅返回数据，不发送模型请求。Web 表单向 Academic Controller 提交查询；工作流负责模型提示词和研究状态记录。

#### Token 影响

发起研究可能通过配置的工作流消耗模型 Token。查看、筛选和下载已有结果不发起额外模型请求。

#### KV Cache 影响

本包不操作模型缓存。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 页面直接使用 AcademicResearchRunValue，不提供服务器进度流、自动重试、关闭后的结果恢复或 Brief 审批操作。中止传输请求本身不确认服务器已经结束。用户内容按文字显示。没有独立分歧状态需要 invariant 伴随模块。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文</summary>

固定基准与检查结果见 [中文开发记录](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md)。

</details>
