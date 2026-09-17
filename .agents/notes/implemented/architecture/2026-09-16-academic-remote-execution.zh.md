# Agent Note: Academic Remote 执行

Status: implemented

[English](2026-09-16-academic-remote-execution.md) | 中文

## Problem

Academic 各库已经形成经过测试的后端链路，但缺少由应用负责的入口，无法复用用户 Session 的模型和 Web 服务。仅凭 arXiv 规范化后的标题、作者和日期元数据，也无法判断自然语言纳入与排除规则。

## Decision

`@deepseek-ai/dsh-api-academic-research-controller` 负责单个 `academicResearch.run` Remote 操作。它通过 Session Controller 解析目标 Agent，使用 `runMaintenance()` 占用空闲阶段，从最新 Session 请求头或 Agent 选择取得模型配置，并把 Agent 范围内的 Academic 检索与 Web 获取服务绑定到 `runAcademicResearchDraft()`。

请求携带 Session 身份、检索词、结果上限和合成数据声明，但不携带 `ResearchBrief`。控制器从持久 Session 日志里最近一次成功的原生或 PTC `exit_plan_mode` 事件重建 Brief，要求计划中恰好包含一个 `academic-research-brief-json` 围栏区块，校验全部字段，根据 Session 与获批工具调用生成稳定身份，并以审核时间记录版本 1。Academic 预设在计划获批后结束当前轮次且不执行通用 Web 研究，主机等待 Session 空闲后再调用 Remote 操作。

Web 组合只挂载一个 Academic 检索提供方 arXiv。确定性选择在获取前按照规范版本、论文类型、撤稿状态、预印本策略、发表时间范围和批准数量进行过滤。逐篇模型响应同时携带带原因的范围决定和证据草稿。被排除论文保留该决定，但不进入分析。

Remote 与 Agent 的取消信号合并。调用只在有界的一轮处理结束后完成，不承诺持久运行身份或断线恢复协议。

## Alternatives considered

**由浏览器选择论文。** 这会向界面暴露提供方和摄取细节，并使不同消费者执行不同策略。

**由浏览器提交获批 Brief。** 调用方可以在审批后替换字段，持久 Session 日志也不再是实际执行范围的权威来源。

**根据检索元数据解释自然语言规则。** arXiv 规范化结果没有保留足够内容，这样做会产生缺乏依据的排除决定。

**立即增加启动、跟随和恢复操作。** 当前工作流不持久化完整生命周期或结果；可恢复传输会声明存储层尚不能兑现的保证。

## Consequences

首个应用入口保持精简，并复用现有 Session、Remote、Academic 来源和 Web 能力归属。C 可以调用一个类型化操作并渲染返回报告，无需构造获批 Brief。获批计划缺少结构化区块时，Session 无法启动 Academic 运行；版本 1 之后的获批 Brief 修订仍不受支持。调用方断线后无法恢复正在执行的结果；每篇被选全文都会消耗一次模型请求，即使范围判断最终排除该论文。其他可检索来源只有在其提供方补齐全文候选地址发现后，才能成为完整的应用来源。
