---
description: "依托 Session 执行一轮有界 Academic 研究的 Remote 入口。"
kind: "package-reference"
---
# Academic Research Controller

[English](README.md) | 中文

## 概述

`paperConcurrency` 默认每轮并发 3 篇论文，设为 1 可串行获取和抽取。检索仍按顺序执行，论文任务收尾后才开始洞察分析。批准的纳入上限可能降低实际并发数。来源和 Web 结果接口保持不变。并发可能增加上游限流，不保证按比例提速。

`@deepseek-ai/dsh-api-academic-research-controller` 负责 `ctx.remote.academicResearch.run` 与 `runStream`。一次调用解析既有 Session Agent，从计划审批记录重建 ResearchBrief，复用 Session 选择的模型，执行已批准的检索方向，执行确定性的元数据筛选，获取全文，使用模型复核自然语言范围规则，抽取证据并返回经过评测的草稿。

本包导出实时进度接入使用的第 1 版 `AcademicResearchProgressView` 与 `AcademicResearchRunFrame` 浏览器接口。每个进度帧都是完整且序号单调递增的快照，固定包含检索、筛选、全文、证据抽取、洞察分析和报告六个阶段；全文与证据并发时通过 `activeStages` 同时表达。接口只包含观察到的数量、检索操作活动、论文／版本身份和已运行时间，不估算完成百分比。学术 Provider 直接搜索、Web 发现、引用识别和每一条引用核验使用不同操作名；核验事实还携带从一开始的条目位置。工作流生产共用的运行内字段；模型适配器尚未报告的分段与重试字段可以缺席或为 `null`。`academicResearch.runStream` 现在通过同一个 Remote 操作传输这些快照和唯一最终结果；原有一元 `academicResearch.run` 在 Web 切换到流之前保留为兼容入口。

同一条流还发送包含完整 `AcademicQ6Projection` 快照的 `q6` 帧。快照绑定 Session、检索运行和准确 Brief 版本，把每项权威候选评估与论文、版本及审核过的评估输入关联，并原样提供轮次、批次决定与结算、逐题覆盖、停止决定和限制，不重新计算业务事实。`sequence` 在同一检索运行内单调递增。分区状态区分尚未产生、已完成的空值、截断和失败。终态 `AcademicResearchRunValue.q6` 重复最后一份快照；只有没有产生排序工作流的旧选择器返回 `null`。客户端不从 Session 事件重建这些事实，也不为读取数据启动第二次研究。

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

将控制器与 `academicSource`、`sessionController`、`typert` 和 `web` 一起挂载。Web 应用在 Academic 来源运行时中挂载 OpenAlex、arXiv、CVF、ACL Anthology 与 PMLR Provider。`fulltextFetchProvider` 默认为 `http`，只为 Academic 全文选择 Web 抓取 Provider，不改变部署中的普通 Web 抓取默认值。所选 Provider 必须保留有界的原始 HTML 或 PDF，因为证据包会拒绝转换后的文本和截断文档。`extractionMaxTokens` 默认为 16,384，只在 Session 模型选择未提供 `maxTokens` 时补充 Academic 抽取输出预留；Session 的明确值仍然优先。`extractionMaxAttempts` 默认为 2，且只允许 1 或 2；输出 token 用尽和配置的瞬时故障可以消耗同一批次的第二次尝试。`extractionRetryInitialDelayMs` 默认为 10,000。长论文抽取使用 `extractionBatchMaxInputTokens` 12,000、`extractionBatchOverlapCharacters` 512 和 `extractionAttemptTimeoutMs` 120,000，在多批请求间保留原始片段定位。`synthesisMaxAttempts` 默认为 3，`synthesisRetryInitialDelayMs` 默认为 1,000；最终报告合成只重试连接和超时错误，每次失败后的等待时间加倍。先调用 `academicResearch.plan(sessionId)` 预览，再向 `academicResearch.runStream` 传入返回的 `researchBriefId`、Session ID、可选全局结果上限和合成数据声明。消费每个 `progress` 帧时，以同一 `retrievalRunId` 下的新快照替换旧快照；唯一 `result` 帧携带既有终态结果。调用方必须只打开一次这个一次性流，不能把它放进自动重连订阅。关闭流、切换 Session 或调用方取消会中止同一个维护任务，不会重新启动研究。客户端迁移期间，一元 `academicResearch.run` 接受相同请求。两个入口都会拒绝预览后已经变化的批准身份。查询只来自已批准计划，调用者不能替换；去除首尾空白后的完全重复查询只执行一次，查询数同时受三条硬上限与已批准 `maximumSearchRounds` 约束。控制器读取该 Session 最近一次成功的 `exit_plan_mode` 审批，校验其中唯一的 `academic-research-brief-json` 区块，并补充稳定身份、版本 1 和审批元数据，因此调用方不能替换成未经审批的 Brief。模型选择仍归 Session 所有。开始运行前，控制器从 Agent 上下文解析 Academic 来源与 Web 服务；任一服务缺失时返回可用性错误。

新结构化计划交接使用 `schemaVersion: 4`，必须包含 `searchPlan`；每项有 `query`、中文 `purpose`、与 Brief 完全一致的 `questions`，以及与查询一同审核的 `retrieval` 策略，覆盖所有研究问题。`targetIncludedWorks` 与证据充足最低值和强制停止上限分别审核，三者必须保持顺序。策略选择 `academic` 和／或 `web_discovery`，直接检索只允许 OpenAlex/arXiv，引用核验只允许 OpenAlex/arXiv/ACL/PMLR/CVF，Web 发现与核验上限均不得超过 8。依赖渠道的 Provider 列表和数量必须相符；重复值、不支持的值、未知字段、负数与超限值都会在审核前被拒绝。Controller 将交接投影为第 1 版领域 Brief 与独立流水线查询。旧第 1 至第 3 版计划仍可读取，并保留原有的最大数量兼作目标行为；缺少检索方案时不能预览或运行，提示用户让系统补齐并重新审核。运行时不额外调用模型生成查询。

第 3 版和第 4 版运行把每条完全一致的获批查询绑定到审核过的策略。所有首批获批查询方向都属于第 1 轮；查询数量由独立上限约束，后续轮次专门留给证据缺口补检。Controller 通过 Academic Retrieval 的 `executePlannedSearchRound()` 适配 `searchProviders()` 直接检索、`web.search()` 发现和 `verifyReference()` 权威核验。已批准轮次与证据缺口轮次现在统一由 Q3 负责查询结算、稳定查询来源、摄取和 Web 操作进度；Controller 只把结果投影到既有工作流与浏览器契约。Web 来源只用于识别引用，生成式回答会被丢弃。核验成功的论文进入既有全文和证据流水线。第 1、2 版中没有 retrieval 策略的查询继续使用旧 `searchAll()` 适配器。Web 搜索与核验失败计入 `stages.search`，并在 `retrievalRun.failures` 保留操作类别；其他成功结果继续保留。可选的 `hybridRetrieval` 字段投影已完成查询的渠道阶段、分别计量的 URL／引用／尝试／论文数、识别问题、核验结果和实际 ingestion 合并。候选和引用行携带查询。发现 URL 移除凭据、查询参数和片段；不返回网页片段、生成式回答或原始错误。

第 3 版和第 4 版选文让审核过的“查询—研究问题”来源贯穿 ingestion，依据已核验元数据和当前全文解析状态形成保守候选评估，调用 Academic Retrieval 排序器，再把权威 P0/P1/P2 队列交给 Q5 分批执行。缺失的学术摘要和关键词保持明确未知，自然语言范围规则延期到既有全文模型检查。只有具备可解析全文交接的候选才占用配置的候选上限。`initialCandidateBatchSize` 默认为 8，`evidenceGapCandidateBatchSize` 与 `replenishmentCandidateBatchSize` 默认为 4，`minimumQuestionSupportingWorks` 默认为 1。当证据缺口决定仍有检索轮次余量时，Controller 会执行一轮缺口补检——`gapRoundMaximumQueriesPerRound` 默认为 4，`gapRoundMaximumAcademicResultsPerQuery` 默认为 20——合并新发现论文、重新排序并继续调度；没有轮次余量时本轮把缺口作为运行限制报告。Controller 会追加 `academic/search-plan`、`academic/candidate-batch-decision`、`academic/candidate-batch-settlement` 与 `academic/run-settlement` 四类 Session 事件；依据这些事件恢复运行仍留待后续。

操作通过 `runMaintenance()` 占用 Agent 的空闲阶段。Academic 预设在计划获批后结束当前轮次，客户端等待 Session 空闲后再启动该操作。正在执行的聊天或其他维护操作返回 `session/agent-busy`。Remote 取消与 Agent 取消合并为同一个信号。查询按顺序执行；已完成批次按轮转顺序合并、去重，再使用同一个全局候选上限后进入选文。整轮完成或观察到取消后，响应返回工作流结果、Session ID 和 JSON 安全的 `retrievalRun`。该运行记录包含实际调用的 Provider、实际开始执行的查询、去重与纳入成果身份、覆盖统计、截断原因以及清理后的来源或论文操作失败；该接口不提供断线恢复。

元数据选择使用规范版本、批准的论文类型、预印本策略、发表时间范围、撤稿状态和候选数量上限。每个来源 Provider 提供自己的有序全文候选。全文解析后，模型返回明确的纳入或排除决定及原因；被排除论文保留在论文结果中，但不向分析提供证据。顶层 `status` 表示调用已完成或取消；由生产方确定的 `stages.search`、`stages.fulltext` 与 `stages.extraction` 分别表达三个阶段，客户端不必根据计数猜测。`retrievalRun.status` 保留为整轮研究处理结论，`report.evaluation.status` 表示草稿质量。

-----

每轮按核验 Provider 和来源记录身份保留权威核验返回的全文候选。选文复用这些结果，包括明确无全文；仅核验的来源无需开启目录搜索，已失败的地址解析不会再次执行。其他来源记录使用来源运行时解析器。全文地址解析失败保留引用核验成功，在引用说明和 `retrievalRun.failures` 中以 `resolve_fulltext` 披露，并影响 `stages.fulltext`，不计入核验失败数。报告标记 `retrievalDisclosureIncluded: true` 表示已含后端检索附录。

<a id="model-experience"></a>
## Model Experience

### Academic 研究运行

#### What the model sees

控制器不增加提示词。它将批准的 `inclusionRules` 和 `exclusionRules` 交给 Academic 工作流的逐篇模型请求，并使用 Session 已选择的提供方和模型。

#### Token effect

每篇被选论文产生一个或多个有序范围与证据批次。每批遵守配置的估算输入上限；单个来源片段必须切分时保留重叠，并拥有独立超时和有界重试。一个批次超时时，其他成功批次的证据仍然保留，不重复检索或全文获取。最终报告合成是独立调用，瞬时故障重试复用同一批已准入证据。

#### KV Cache effect

各论文独立请求，不重放 Session 对话。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- CVF、ACL Anthology 与 PMLR 只搜索 Web 组合配置的目录页；新增会议或论文集只需修改配置。
- 一个一次性 Remote 流会保持到整轮结束。断线重连与续跑、调用方离开后的后台继续、RetrievalRun 持久记录和检索级重试留待后续。
- 混合计数累加已完成查询；中断查询不计入，并在 RetrievalRun 限制中披露。没有已完成混合查询时省略投影。`mergedDuplicates` 为整轮上限应用前的 ingestion 记录数减去不同论文数，不包含重复引用或被截断的记录。核验成功不代表保留为候选或纳入证据。持久化的发现到论文溯源仍属于 B-H3。
- 当前每份获批计划都会建立版本 1，其身份由 Session 和获批计划调用共同确定；对已批准 Brief 进行后续版本修订留待后续。

-----

本控制器不发布 invariant 伴随模块，因为每次响应直接来自 Session 与工作流结果，没有独立维护的第二份副本；调用时校验检查获批 Plan 和响应关联。

<a id="dev-note"></a>
### 开发备注

参见 [Academic Remote 执行决策](../../../.agents/notes/implemented/architecture/2026-09-16-academic-remote-execution.zh.md)、[明确查询编排决策](../../../.agents/notes/implemented/architecture/2026-09-18-academic-explicit-query-orchestration.zh.md)、[单次调用全文抓取决策](../../../.agents/notes/implemented/architecture/2026-09-20-call-scoped-web-fetch-provider.zh.md)和[证据抽取恢复决策](../../../.agents/notes/implemented/architecture/2026-09-20-academic-evidence-extraction-recovery.zh.md)。
