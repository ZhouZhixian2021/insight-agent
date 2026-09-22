---
description: "依托 Session 执行一轮有界 Academic 研究的 Remote 入口。"
kind: "package-reference"
---
# Academic Research Controller

[English](README.md) | 中文

## 概述

`paperConcurrency` 默认每轮并发 3 篇论文，设为 1 可串行获取和抽取。检索仍按顺序执行，论文任务收尾后才开始洞察分析。批准的纳入上限可能降低实际并发数。来源和 Web 结果接口保持不变。并发可能增加上游限流，不保证按比例提速。

`@deepseek-ai/dsh-api-academic-research-controller` 负责 `ctx.remote.academicResearch.run`。一次调用解析既有 Session Agent，从计划审批记录重建 ResearchBrief，复用 Session 选择的模型，检索所有已注册的学术来源，执行确定性的元数据筛选，获取全文，使用模型复核自然语言范围规则，抽取证据并返回经过评测的草稿。

## 目录

- [使用方式](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用方式

存在工具运行时时，控制器挂载随自身释放的 `tools/execute` 校验。携带 Academic Brief 围栏的 `exit_plan_mode` 调用在审核工具执行前完成解析与可执行要求检查，也覆盖 PTC 子调用；普通计划继续执行。校验不会从无关文本推断学术计划。Remote 接收运行请求时再次检查已批准 Brief，因此已有不兼容计划会在检索前返回具体字段提示，需要修正计划并重新批准，不会被静默改写。

返回值还包含 `synthesis: { status, reasons }`，状态为 `not_run`、`blocked`、`failed`、`completed` 或 `partial_success`，与检索及审核独立。洞察部分成功保留草稿，并列出被拒候选段落序号与原因。没有合格段落或整份响应无效时不返回报告，但保留论文。洞察调用沿用解析后的会话模型、输出预算与尝试上限。

论文抽取结果返回 `extracted`、`partially_extracted` 或 `extraction_failed`，以及合格 `evidenceCount` 和 `rejectedDrafts`；后者包含从零开始的草稿/片段序号、稳定拒绝代码和原因。部分抽取结果同时向 `stages.extraction` 提供成功与失败观察，全部被拒的论文只贡献失败。即使没有合格证据，响应仍保留这些诊断，不会把被拒的模型陈述作为证据返回。

将控制器与 `academicSource`、`sessionController`、`typert` 和 `web` 一起挂载。Web 应用在 Academic 来源运行时中挂载 arXiv、CVF、ACL Anthology 与 PMLR Provider。`fulltextFetchProvider` 默认为 `http`，只为 Academic 全文选择 Web 抓取 Provider，不改变部署中的普通 Web 抓取默认值。所选 Provider 必须保留有界的原始 HTML 或 PDF，因为证据包会拒绝转换后的文本和截断文档。`extractionMaxTokens` 默认为 16,384，只在 Session 模型选择未提供 `maxTokens` 时补充 Academic 抽取输出预留；Session 的明确值仍然优先。`extractionMaxAttempts` 默认为 2，且只允许 1 或 2；只有输出 token 用尽才消耗第二次尝试。先调用 `academicResearch.plan(sessionId)` 预览，再向 `academicResearch.run` 传入返回的 `researchBriefId`、Session ID、可选全局结果上限和合成数据声明。预览后批准身份发生变化时拒绝启动。查询只来自已批准计划，调用者不能替换；去除首尾空白后的完全重复查询只执行一次，查询数同时受三条硬上限与已批准 `maximumSearchRounds` 约束。控制器读取该 Session 最近一次成功的 `exit_plan_mode` 审批，校验其中唯一的 `academic-research-brief-json` 区块，并补充稳定身份、版本 1 和审批元数据，因此调用方不能替换成未经审批的 Brief。模型选择仍归 Session 所有。开始运行前，控制器从 Agent 上下文解析 Academic 来源与 Web 服务；任一服务缺失时返回可用性错误。

新结构化计划交接使用 `schemaVersion: 2`，必须包含 `searchPlan`；每项有 `query`、中文 `purpose` 和与 Brief 完全一致的 `questions`，覆盖所有研究问题。Controller 将交接投影为既有第 1 版领域 Brief 与独立流水线查询，不修改 model 包。旧第 1 版计划仍可读取，但缺少检索方案时不能预览或运行，提示用户让系统补齐并重新审核；运行时不额外调用模型生成查询。

公共 Remote 字段还预留了每条检索可选的 `retrieval` 策略和整轮可选的 `hybridRetrieval` 投影。策略区分 `academic` 与 `web_discovery`、直接检索 Provider 与引用核验 Provider，并分别记录 Web 发现与引用核验上限。运行投影包含由生产方结算的混合阶段、彼此独立的 URL/引用/论文计数以及清理后的引用结果。当前第 2 版计划与单通道运行均不返回这两个字段；缺失表示“未提供混合策略”，不表示各项为零。后续计划与工作流增量会填充它们，而无需改变已经固定的浏览器契约。

操作通过 `runMaintenance()` 占用 Agent 的空闲阶段。Academic 预设在计划获批后结束当前轮次，客户端等待 Session 空闲后再启动该操作。正在执行的聊天或其他维护操作返回 `session/agent-busy`。Remote 取消与 Agent 取消合并为同一个信号。查询按顺序执行；已完成批次按轮转顺序合并、去重，再使用同一个全局候选上限后进入选文。整轮完成或观察到取消后，响应返回工作流结果、Session ID 和 JSON 安全的 `retrievalRun`。该运行记录包含实际调用的 Provider、实际开始执行的查询、去重与纳入成果身份、覆盖统计、截断原因以及清理后的来源或论文操作失败；该接口不提供断线恢复。

元数据选择使用规范版本、批准的论文类型、预印本策略、发表时间范围、撤稿状态和候选数量上限。每个来源 Provider 提供自己的有序全文候选。全文解析后，模型返回明确的纳入或排除决定及原因；被排除论文保留在论文结果中，但不向分析提供证据。顶层 `status` 表示调用已完成或取消；由生产方确定的 `stages.search`、`stages.fulltext` 与 `stages.extraction` 分别表达三个阶段，客户端不必根据计数猜测。`retrievalRun.status` 保留为整轮研究处理结论，`report.evaluation.status` 表示草稿质量。

-----

<a id="model-experience"></a>
## Model Experience

### Academic 研究运行

#### What the model sees

控制器不增加提示词。它将批准的 `inclusionRules` 和 `exclusionRules` 交给 Academic 工作流的逐篇模型请求，并使用 Session 已选择的提供方和模型。

#### Token effect

每篇被选论文产生一次有界的范围与证据请求；只有第一次回答达到输出 token 上限时才允许再试一次。如果估算输入加 Session 的明确输出上限或控制器的 `extractionMaxTokens` 预留超过所选模型的上下文窗口，工作流会在发送前暂停该论文。

#### KV Cache effect

各论文独立请求，不重放 Session 对话。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- CVF、ACL Anthology 与 PMLR 只搜索 Web 组合配置的目录页；新增会议或论文集只需修改配置。
- 一次 Remote 调用会保持到整轮结束。工作流续跑、进度流、RetrievalRun 持久记录、检索级重试和长论文分段留待后续。
- 混合 Web 发现尚未执行。可选计划与结果字段只是供后续计划、工作流、Provider 和客户端增量共同使用的接口基线。
- 当前每份获批计划都会建立版本 1，其身份由 Session 和获批计划调用共同确定；对已批准 Brief 进行后续版本修订留待后续。

-----

本控制器不发布 invariant 伴随模块，因为每次响应直接来自 Session 与工作流结果，没有独立维护的第二份副本；调用时校验检查获批 Plan 和响应关联。

<a id="dev-note"></a>
### 开发备注

参见 [Academic Remote 执行决策](../../../.agents/notes/implemented/architecture/2026-09-16-academic-remote-execution.zh.md)、[明确查询编排决策](../../../.agents/notes/implemented/architecture/2026-09-18-academic-explicit-query-orchestration.zh.md)、[单次调用全文抓取决策](../../../.agents/notes/implemented/architecture/2026-09-20-call-scoped-web-fetch-provider.zh.md)和[证据抽取恢复决策](../../../.agents/notes/implemented/architecture/2026-09-20-academic-evidence-extraction-recovery.zh.md)。
