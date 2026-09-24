---
description: "学术研究报告的 Web 客户端界面：真实会话研究运行页面与内部 HTML 报告渲染器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-academic-research

[English](README.md) | 中文

## 概述

主 Web 侧栏在当前已保存会话中发起学术研究，分别展示正式 Remote 返回的运行状态、整轮处理结果、来源检索、全文获取、证据抽取、报告质量、覆盖统计、证据及 Markdown 下载。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

已批准计划预览区分直接搜索来源与引用核验来源，并展示渠道、问题及每条查询的预算。`hybridRetrieval` 是终态观察记录：页面直接展示五个阶段与不同单位的 URL、引用和论文数量，不推测实时进度。缺少投影或旧计划策略时明确说明未知。识别引用不等于核验成功。报告预览和 Markdown 下载保留服务器正文，并使用同一实际结果附加带标题、经过转义的检索披露；不改变质量状态，Web 候选 URL 不进入参考文献。

草稿存在 `insufficient_coverage` 评测问题时，保留 Markdown 下载并显示本地化的证据有限提示。正式交付被阻止不会隐藏已有草稿。

运行面板将洞察状态和原因与抽取及审核分别展示。`partial_success` 保留草稿下载和被拒候选段落原因，不表示报告审核通过。逐题回答与缺口位于 Markdown。洞察失败或被阻止时不提供报告下载。

`renderResearchPage()` — 传入已评测的 ResearchReport 和明确的 zh-CN 或 en 界面语言。返回的 HTML 包含样式与交互，不依赖服务或外部资源，报告文字在 HTML 和嵌入 JSON 中均转义。搜索筛选结论和证据，证据链接展开详情，下载导出原始 Markdown。该渲染器继续作为内部辅助函数。主 Web 通过 sidebar.footer.action 注册研究入口，并使用框架 locale 字典。

选择模型并审核研究计划后，打开侧栏入口，通过 `academicResearch.plan` 预览主题、研究问题和中文检索方向。页面不再提供查询输入框。“按计划开始研究”向 `academicResearch.run` 传递 `sessionId`、预览返回的 `researchBriefId`、`synthetic: false` 与 AbortSignal。缺少或不完整的计划提示用户回到聊天完成审核；批准身份变化后需要重新打开预览。表单释放后忽略迟到的预览响应。取消、关闭页面及切换会话均中止本次请求；已卸载表单的迟到响应不能更新其他会话。服务器返回取消结果时保留实际成果；取消后未收到最终响应则明确提示，不伪造服务器完成状态。页面直接展示生产方返回的 `stages` 结论，因此后续证据抽取失败时，已成功的检索与全文获取仍会明确显示。覆盖截断提示为“检索覆盖受限或提前截断”，不将其原因仅解释为数量上限。运行中不显示进度百分比，providerBreakdown 为 null 时不生成逐来源计数。固定场景仅用于测试。

逐篇结果区分完整、部分与失败的抽取状态。页面显示合格证据数量、被拒草稿序号和本地化原因。草稿序号从一开始显示，来源片段序号保留为生产方诊断。被拒陈述不会作为合格报告证据展示。

<a id="model-experience"></a>
## 模型体验

### 返回结果

#### 模型看到的内容

独立渲染器 `renderResearchPage()` 仅返回数据，不发送模型请求。Web 表单向 Academic Controller 提交预览过的批准身份；工作流负责模型提示词和研究状态记录。

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

固定基准见[报告开发记录](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md)，阶段结论见[证据抽取恢复决策](../../../.agents/notes/implemented/architecture/2026-09-20-academic-evidence-extraction-recovery.zh.md)。

</details>
