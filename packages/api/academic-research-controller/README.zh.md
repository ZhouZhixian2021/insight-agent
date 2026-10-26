---
description: "依托 Session 执行一轮有界 Academic 研究的 Remote 入口。"
kind: "package-reference"
---
# Academic Research Controller

[English](README.md) | 中文

## 概述

使用 Session 选择的模型执行已批准的学术研究 Brief，返回基于论文核验证据的草稿。控制器提供计划校验、有界检索与候选审核、全文抽取、综合、进度及后台运行接口。调用方可查看失败与覆盖限制，或为一篇论文单独请求证据增强。研究必须经过计划批准；证据不足会保留在结果说明中。

## 目录

- [使用方式](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用方式

`paperConcurrency` 默认每轮并发 3 篇论文，设为 1 可串行获取和抽取。检索仍按顺序执行，论文任务收尾后才开始洞察分析。批准的纳入上限可能降低实际并发数。并发可能增加上游限流，不保证按比例提速。

`@deepseek-ai/dsh-api-academic-research-controller` 负责 `ctx.remote.academicResearch.run` 与 `runStream`。一次调用解析既有 Session Agent，从计划审批记录重建 ResearchBrief，复用 Session 选择的模型，执行已批准的检索方向，执行确定性的元数据筛选，获取全文，使用模型复核自然语言范围规则，抽取证据并返回经过评测的草稿。

正式运行在范围审核之后选择一级证据抽取：每篇纳入论文最多保留五条经过来源核验、关联获批问题的记录。第 5 版计划中审核过的问题别名按 Brief 问题顺序传给片段优先排序；旧计划继续使用问题原文。词项只影响处理顺序，不决定范围或构成证据。无故障达到上限不算抽取失败。现有证据充分性与报告评测规则仍决定结果是否为有限草稿；Controller 不会把它提升为正式审核报告。

研究运行完成后，调用方可通过 `academicResearch.enhanceEvidence({ sessionId, retrievalRunId, workVersionId })` 选择一篇有证据的论文，单独执行二级补充。Controller 重新获取该论文已选的全文候选，并在调用模型前拒绝内容哈希变化，随后持久记录选择。默认整次最多 180 秒、单次模型尝试最多 60 秒、输出上限 8,192 token；这些数值可配置。返回值只说明新增证据数与未完成范围数，原草稿和评测保持不变。同一轮第二次选择会被拒绝，包括此前失败或取消的情况；已提交的片段仍保留在 Session 中。

对于第 5 版计划，Controller 先应用已批准的确定性元数据排除规则并检查全文地址，再请求 Session 已选模型审核去重候选的规范学术标题和摘要。已排除或全文地址不可解析的候选保留词项评估、排序记录与原因，不调用模型。纯选择器在跨轮共用的 `candidateReviewMaximumWorks` 额度（默认 8 篇）内先分配问题覆盖名额，再按词项初排补齐；该额度独立于 Plan 候选上限，候选截断在最终排序后执行。审核预算外的合格论文保留词项初筛与明确未审核状态。每个初轮学术查询保留至多 `initialSearchMaximumAcademicResultsPerQuery` 条原始记录（默认 100），有效候选上限更大时使用后者；来源截断仍可能遗漏后续记录。精简提示词只要求范围判断和带引文的问题匹配，B 的解析器核对准确的学术标题或摘要原文及批准问题。发现查询只用于路由。选择、准确请求、结算结果和已验证判断均在参与评分前持久保存。模型、超时与非法输出失败保留该论文的词项初筛；存储失败或取消停止派发并等待在途调用结束。初轮和证据缺口轮共用审核预算，实际派发即占用额度，调用失败也计入。`candidateReviewMaxTokens` 默认 8,192，`candidateReviewAttemptTimeoutMs` 默认 150,000 毫秒，两者均为部署配置。

本包导出实时进度接入使用的第 1 版 `AcademicResearchProgressView` 与 `AcademicResearchRunFrame` 浏览器接口。每个进度帧都是完整且序号单调递增的快照，固定包含检索、筛选、全文、证据抽取、洞察分析和报告六个阶段；全文与证据并发时通过 `activeStages` 同时表达。接口只包含观察到的数量、检索操作活动、论文／版本身份和已运行时间，不估算完成百分比。学术 Provider 直接搜索、Web 发现、引用识别和每一条引用核验使用不同操作名；核验事实还携带从一开始的条目位置。工作流生产共用的运行内字段；候选选择期间还报告有上限的审核完成／计划数量、失败和跳过数量；模型适配器尚未报告的分段与重试字段可以缺席或为 `null`。`academicResearch.runStream` 现在通过同一个 Remote 操作传输这些快照和唯一最终结果；一元 `academicResearch.run` 仍可用于调用方拥有的执行。

同一条流还发送包含完整 `AcademicQ6Projection` 快照的 `q6` 帧。快照绑定 Session、检索运行和准确 Brief 版本，把每项权威候选评估与论文、版本及审核过的评估输入关联，并原样提供轮次、批次决定与结算、逐题覆盖、停止决定和限制，不重新计算业务事实。`sequence` 在同一检索运行内单调递增。分区状态区分尚未产生、已完成的空值、截断和失败。终态 `AcademicResearchRunValue.q6` 重复最后一份快照；只有没有产生排序工作流的旧选择器返回 `null`。客户端不从 Session 事件重建这些事实，也不为读取数据启动第二次研究。可选的 `assessment.screening` 在 B 产出后承载元数据原文片段、表面关键词命中、不确定项和相对 Plan 的范围判断；旧评估不包含此字段。

需要关闭页面后仍继续研究时，在 `plan(sessionId)` 后调用 `startBackgroundRun(request)`，立即取得归属该 Session 的 `backgroundRunId`。`getBackgroundRun({ sessionId, backgroundRunId })` 读取最新状态，`listBackgroundRuns(sessionId)` 供刷新页面后找回近期运行，`watchBackgroundRun(key, signal)` 发送当前状态及后续更新。断开订阅不会取消研究；只有 `cancelBackgroundRun({ ...key, reason: 'user_requested' })` 才请求取消。每次完整状态（包括最终结果和取消意图）写入 Session。Host 正常释放时记录 `service_stopped` 并等待任务停止；异常停止后重新打开未结算日志时返回 `interrupted`，不编造取消来源。两种情形都保留最后进度和检索运行 ID。Host 停止不会结算检索运行，允许显式检查点恢复；用户取消会写入终态，不能继续恢复。原有基于检查点的 `resumeRetrievalRunId` 是独立的显式操作，可能重试未结算批次。Web 研究页面使用后台接口；旧 `run` 和 `runStream` 继续保留调用方断开即取消的语义。

存在工具运行时时，控制器挂载随自身释放的 `tools/execute` 校验。携带 Academic Brief 围栏的 `exit_plan_mode` 调用在审核工具执行前完成解析与可执行要求检查，也覆盖 PTC 子调用；普通计划继续执行。校验不会从无关文本推断学术计划。Remote 接收运行请求时再次检查已批准 Brief，因此已有不兼容计划会在检索前返回具体字段提示，需要修正计划并重新批准，不会被静默改写。

返回值还包含 `synthesis: { status, reasons }`，状态为 `not_run`、`blocked`、`failed`、`completed` 或 `partial_success`，与检索及审核独立。洞察部分成功保留草稿，并列出被拒候选段落序号与原因。没有合格段落或整份响应无效时不返回报告，但保留论文。洞察调用沿用解析后的会话模型、输出预算与尝试上限。

论文抽取结果返回 `extracted`、`partially_extracted` 或 `extraction_failed`，以及合格 `evidenceCount` 和 `rejectedDrafts`；后者包含从零开始的草稿/片段序号、稳定拒绝代码和原因。部分抽取结果同时向 `stages.extraction` 提供成功与失败观察，全部被拒的论文只贡献失败。即使没有合格证据，响应仍保留这些诊断，不会把被拒的模型陈述作为证据返回。

将控制器与 `academicSource`、`sessionController`、`sessionQuery`、`typert` 和 `web` 一起挂载。批准计划、恢复检查点和后台历史通过异步 `sessionQuery.readSession` 读取；读取失败会在研究调度前停止依赖操作。后台列表读取会保留在途运行，直到快照读取结束，因此读取期间完成的运行仍返回终态。Web 应用在 Academic 来源运行时中挂载 OpenAlex、arXiv、CVF、ACL Anthology 与 PMLR Provider。全文获取使用已配置的 Web 抓取 Provider。所选 Provider 必须保留有界的原始 HTML 或 PDF，因为证据包会拒绝转换后的文本和截断文档。`extractionMaxTokens` 默认为 16,384，用于证据抽取；`synthesisMaxTokens` 默认为 32,768，用于最终报告合成。只有 Session 模型选择未提供 `maxTokens` 时才使用这些预留值；Session 的明确值对两阶段均优先。`extractionMaxAttempts` 默认为 2，且只允许 1 或 2；输出 token 用尽和配置的瞬时故障可以消耗同一批次的第二次尝试。`extractionRetryInitialDelayMs` 默认为 10,000。长论文抽取使用 `extractionBatchMaxInputTokens` 12,000、`extractionBatchOverlapCharacters` 512 和 `extractionAttemptTimeoutMs` 150,000，在多批请求间保留原始片段定位。`extractionMaxAttempts` 为 2 时，本地计时超时的证据输入会拆成两个较小输入各尝试一次；模型提供方报告的瞬时超时仍按配置的重试策略处理。`synthesisMaxAttempts` 默认为 3，`synthesisRetryInitialDelayMs` 默认为 1,000；最终报告合成只重试连接和超时错误，每次失败后的等待时间加倍。先调用 `academicResearch.plan(sessionId)` 预览，再向 `academicResearch.runStream` 传入返回的 `researchBriefId`、Session ID、可选全局结果上限和合成数据声明。消费每个 `progress` 帧时，以同一 `retrievalRunId` 下的新快照替换旧快照；唯一 `result` 帧携带既有终态结果。调用方必须只打开一次这个一次性流，不能把它放进自动重连订阅。关闭流、切换 Session 或调用方取消会中止同一个维护任务，不会重新启动研究。客户端迁移期间，一元 `academicResearch.run` 接受相同请求。两个入口都会拒绝预览后已经变化的批准身份。查询只来自已批准计划，调用者不能替换；去除首尾空白后的完全重复查询只执行一次，查询数同时受三条硬上限与已批准 `maximumSearchRounds` 约束。控制器读取该 Session 最近一次成功的 `exit_plan_mode` 审批，校验其中唯一的 `academic-research-brief-json` 区块，并补充稳定身份、版本 1 和审批元数据，因此调用方不能替换成未经审批的 Brief。模型选择仍归 Session 所有。开始运行前，控制器从 Agent 上下文解析 Academic 来源与 Web 服务；任一服务缺失时返回可用性错误。

新结构化计划交接使用 `schemaVersion: 5`，必须包含 `searchPlan` 和 `candidateScreening`；每项有 `query`、中文 `purpose`、与 Brief 完全一致的 `questions`，以及与查询一同审核的 `retrieval` 策略，覆盖所有研究问题。审核过的初筛字段为各研究问题提供元数据词项，并提供方法与证据线索；贡献信号可为空。`targetIncludedWorks` 与证据充足最低值和强制停止上限分别审核，三者必须保持顺序。策略选择 `academic` 和／或 `web_discovery`，直接检索只允许 OpenAlex/arXiv，引用核验只允许 OpenAlex/arXiv/ACL/PMLR/CVF，Web 发现与核验上限均不得超过 8。依赖渠道的 Provider 列表和数量必须相符；重复值、不支持的值、未知字段、负数与超限值都会在审核前被拒绝。Controller 将交接投影为第 1 版领域 Brief 与独立流水线查询。旧第 1 至第 4 版计划仍可读取；第 1 至第 3 版保留最大数量兼作目标的行为；缺少检索方案时不能预览或运行，提示用户让系统补齐并重新审核。运行时不额外调用模型生成查询。

第 3 至第 5 版运行把每条完全一致的获批查询绑定到审核过的策略。所有首批获批查询方向都属于第 1 轮；查询数量由独立上限约束，后续轮次专门留给证据缺口补检。Controller 通过 Academic Retrieval 的 `executePlannedSearchRound()` 适配 `searchProviders()` 直接检索、`web.search()` 发现和 `verifyReference()` 权威核验。已批准轮次与证据缺口轮次现在统一由 Q3 负责查询结算、稳定查询来源、摄取和 Web 操作进度；Controller 只把结果投影到既有工作流与浏览器契约。Web 来源只用于识别引用，生成式回答会被丢弃。核验成功的论文进入既有全文和证据流水线。第 1、2 版中没有 retrieval 策略的查询继续使用旧 `searchAll()` 适配器。Web 搜索与核验失败计入 `stages.search`，并在 `retrievalRun.failures` 保留操作类别；其他成功结果继续保留。可选的 `hybridRetrieval` 字段投影已完成查询的渠道阶段、分别计量的 URL／引用／尝试／论文数、识别问题、核验结果和实际 ingestion 合并。候选和引用行携带查询。发现 URL 移除凭据、查询参数和片段；不返回网页片段、生成式回答或原始错误。

第 3 至第 5 版选文让审核过的“查询—研究问题”来源贯穿 ingestion，依据已核验元数据和当前全文解析状态形成保守候选评估，调用 Academic Retrieval 排序器，再把权威 P0/P1/P2 队列交给 Q5 分批执行。Controller 从获批 Brief 派生主题词项。第 5 版计划提供审核过的研究问题、方法、证据和贡献信号；旧计划从已审核查询表达式派生问题词项。摘要和关键词只读取学术 Provider 保留的元数据，Web 摘要不进入初筛证据。已批准计划没有提供对应词汇时，方法、证据和贡献分项均保持零分。只有完整的已审核发表年份范围才产生时效分，否则为零。缺失的学术摘要和关键词保持明确未知，自然语言范围规则延期到既有全文模型检查；证据缺口补检后也复用同一评估路径。只有具备可解析全文交接的候选才占用配置的候选上限。`initialCandidateBatchSize` 默认为 8，`evidenceGapCandidateBatchSize` 与 `replenishmentCandidateBatchSize` 默认为 4，`minimumQuestionSupportingWorks` 默认为 1。当证据缺口决定仍有检索轮次余量时，Controller 会执行一轮缺口补检——`gapRoundMaximumQueriesPerRound` 默认为 4，`gapRoundMaximumAcademicResultsPerQuery` 默认为 20——合并新发现论文、重新排序并继续调度；没有轮次余量时本轮把缺口作为运行限制报告。Controller 会追加 `academic/search-plan`、`academic/candidate-batch-decision`、`academic/candidate-batch-settlement` 与 `academic/run-settlement` 四类 Session 事件；依据这些事件恢复运行仍留待后续。

操作通过 `runMaintenance()` 占用 Agent 的空闲阶段。Academic 预设在计划获批后结束当前轮次，客户端等待 Session 空闲后再启动该操作。正在执行的聊天或其他维护操作返回 `session/agent-busy`。Remote 取消与 Agent 取消合并为同一个信号。查询按顺序执行；每条初轮 Academic 查询使用独立的原始结果上限，已完成批次按轮转顺序合并、去重，再应用硬筛选和全局候选上限。整轮完成或观察到取消后，响应返回工作流结果、Session ID 和 JSON 安全的 `retrievalRun`。该运行记录包含实际调用的 Provider、实际开始执行的查询、去重与纳入成果身份、覆盖统计、截断原因以及清理后的来源或论文操作失败；该接口不提供断线恢复。

元数据选择使用规范版本、批准的论文类型、预印本策略、发表时间范围、撤稿状态和候选数量上限。每个来源 Provider 提供自己的有序全文候选。全文解析后，模型返回明确的纳入或排除决定及原因；被排除论文保留在论文结果中，但不向分析提供证据。顶层 `status` 表示调用已完成或取消；由生产方确定的 `stages.search`、`stages.fulltext` 与 `stages.extraction` 分别表达三个阶段，客户端不必根据计数猜测。`retrievalRun.status` 保留为整轮研究处理结论，`report.evaluation.status` 表示草稿质量。

-----

每轮按核验 Provider 和来源记录身份保留权威核验返回的全文候选。选文复用这些结果，包括明确无全文；仅核验的来源无需开启目录搜索，已失败的地址解析不会再次执行。其他来源记录使用来源运行时解析器。全文地址解析失败保留引用核验成功，在引用说明和 `retrievalRun.failures` 中以 `resolve_fulltext` 披露，并影响 `stages.fulltext`，不计入核验失败数。报告标记 `retrievalDisclosureIncluded: true` 表示已含后端检索附录。

<a id="model-experience"></a>
## Model Experience

### Academic 研究运行

#### What the model sees

候选审核只发送规范学术标题、明确的摘要可用状态、批准主题、去重后的研究问题及范围规则。模型返回范围判断和带原文引文的问题匹配，词项线索由代码计算。`selectCandidateReviews()` 先分配问题覆盖名额，再按词项初排补齐。`candidateReviewMaximumWorks` 默认在初轮和缺口轮之间共用 8 篇审核额度，独立于 Plan 候选上限；`candidateReviewConcurrency` 允许 1 或 2，默认 1。Controller 在判断参与计分前，以版本化 Session 事件持久保存选择、准确请求、结果和已验证判断。Q6 的 `assessment.semanticReview` 区分有效范围判断、模型未知、失败代码和未送审原因；历史评估可以缺少此字段。逐篇证据请求使用批准的范围规则和同一个 Session 已选模型。

#### Token effect

只有选中的合格候选消耗审核调用额度；实际派发后失败也计入，派发前取消和输入超限拒绝不计入。每篇审核仅尝试一次，受 `candidateReviewMaxTokens` 与 `candidateReviewAttemptTimeoutMs` 限制。取消会停止排队审核并等待在途调用结算；可恢复失败保留其他成功论文和词项回退。每篇被选论文随后产生有输入上限、重叠、单次超时和有限重试的范围与证据批次。最终合成是复用已准入证据的独立调用。

#### KV Cache effect

各论文独立请求，不重放 Session 对话。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- CVF、ACL Anthology 与 PMLR 只搜索 Web 组合配置的目录页；新增会议或论文集只需修改配置。
- 现有 `runStream` 仍是调用方拥有的一次性操作。Web 研究页面使用独立后台任务，读取中断记录时不会自动重新执行。服务重启后未结算后台任务标为 `interrupted`；从 Q5 检查点恢复是一次显式新操作。跨服务重启自动续跑和检索级重试仍留待后续。
- 混合计数累加已完成查询；中断查询不计入，并在 RetrievalRun 限制中披露。没有已完成混合查询时省略投影。`mergedDuplicates` 为整轮上限应用前的 ingestion 记录数减去不同论文数，不包含重复引用或被截断的记录。核验成功不代表保留为候选或纳入证据。持久化的发现到论文溯源仍属于 B-H3。
- 当前每份获批计划都会建立版本 1，其身份由 Session 和获批计划调用共同确定；对已批准 Brief 进行后续版本修订留待后续。

-----

本控制器不发布 invariant 伴随模块，因为每次响应直接来自 Session 与工作流结果，没有独立维护的第二份副本；调用时校验检查获批 Plan 和响应关联。

<a id="dev-note"></a>
### 开发备注

参见 [Academic Remote 执行决策](../../../.agents/notes/implemented/architecture/2026-09-16-academic-remote-execution.zh.md)、[明确查询编排决策](../../../.agents/notes/implemented/architecture/2026-09-18-academic-explicit-query-orchestration.zh.md)、[单次调用全文抓取决策](../../../.agents/notes/implemented/architecture/2026-09-20-call-scoped-web-fetch-provider.zh.md)和[证据抽取恢复决策](../../../.agents/notes/implemented/architecture/2026-09-20-academic-evidence-extraction-recovery.zh.md)。

[真实固定论文验收](tests/academic-single-paper.e2e.ts)启动正式 Web 装配，核对检索、去重、候选审核、可定位全文证据和持久化模型记录。测试断开后台订阅，并核对最终结果仍可从持久化事件读取。[Controller 恢复测试](tests/controller.host.spec.ts)在新实例中还原序列化的待处理与已结算检查点，不重复已提交的检索或全文处理。
