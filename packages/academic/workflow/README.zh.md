---
description: "全文解析到证据抽取的论文级哈希交接。"
kind: "package-library"
---

# @deepseek-ai/dsh-academic-workflow

[English](README.md) | 中文

## 概述

extractPaperEvidence 在调用现有证据抽取器前补齐首次观察到的版本哈希，保留版本 ID 和历史对象。冲突返回 paused，调用方保留记录并继续其他论文。

## 目录

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## Use this package

进度类型通过仅供类型导入的 `@deepseek-ai/dsh-academic-workflow/progress` 入口公开。浏览器消费者使用此入口，避免经由执行入口引入宿主 Session 声明。

工作流把每个全文候选观察映射到所属论文活动。候选开始时发布带一基尝试序号的 `fulltext_fetch`；候选失败且还有后续候选时发布 `waiting_retry` 和分类后的失败；接受 HTML 或 PDF 后在证据抽取开始前发布 `fulltext_parse`。取消时先发布论文取消事实，再结算整轮运行。

`PaperEvidenceGenerator` 接受 A 持有的可选进度观察者，不改变证据包的 `EvidenceGenerator`。`createModelEvidenceGenerator()` 发布从一开始的批次位置；尝试开始与结算只在对应 `academic/evidence-request` 或 `academic/evidence-result` 完成持久化后发布；有限重试确定后发布 `waiting_retry`。超时、输出上限、输出不完整和输出无效使用共用的清理后失败代码。`extractPaperEvidence()` 在论文结算前发布来源核验接受数与拒绝数。观察者异常不会改变模型执行、核验或最终研究结果。

带警告准入不满足补选停止条件。候选池用完或达到纳入上限后，`continue_with_warning` 允许基于已有可用证据生成有限草稿；`stop_for_review` 阻止分析。带警告草稿返回 `synthesis.status=partial_success` 和程序生成的原因。取消或零可用证据时不启动分析。

`includedWorkTypes` 按 `WorkVersion.versionType` 筛选：`preprint`、`accepted_manuscript` 或 `version_of_record`。会议与期刊类别不属于版本状态。`allowPreprints: false` 优先排除预印本。流水线也会在获取全文前拒绝适配器选出的、未被批准纳入的版本；发表场所名称不决定纳入资格。`validateResearchBriefRequirements()` 向计划审核调用方提供共用的分析要求检查。

正式入口准入证据后，使用会话模型执行逐题洞察。论文证据抽取可以重试输出截断以及配置的 `TRANSPORT` 和 `TIMEOUT` 失败，并复用同一篇已解析论文的请求，不重复检索或全文获取。最终报告合成可以独立配置对 `TRANSPORT` 和 `TIMEOUT` 失败执行指数退避重试，并复用已经准入的证据，不重复检索、全文获取或证据抽取。合成输出达到上限时最多消耗一次恢复尝试；精简请求保留批准的问题、论文身份和已核验摘录，移除重复的版本、定位与卡片数据。精简请求再次达到上限后以 `SYNTHESIS_MODEL_OUTPUT_LIMIT` 停止，不再原样重试。启用 `retryInvalidOutput` 后，已完成响应因 `SYNTHESIS_INVALID_MODEL_OUTPUT` 被拒时，可以在同一尝试次数上限内复用完整或精简的已准入输入，附加不含原响应文本的解析诊断，重新生成整份 JSON；系统不会修补或重新解释被拒响应。`academic/synthesis-request` 记录每次准确请求；`academic/synthesis-result` 记录每次尝试的原始输出、用量与拒绝诊断。段落部分合格记为 `partially_validated`；全部被拒记为 `failed` 和 `SYNTHESIS_NO_VALID_STATEMENTS`。早期事件及 JSON 解析前的失败不含 `rejectedStatements`。仍有合格段落时，Remote 返回 `partial_success`、拒绝原因与草稿；没有合格段落则不返回报告。达到配置次数后仍然结构无效、证据不足、重试耗尽或取消也不返回报告。持久化失败中止整轮。不使用模板回退、自动语义修复或放宽引用要求。

传入归并后的 WorkVersion、成功解析的 EvidenceExtractionInput、是否已有历史内容或证据的明确布尔值、EvidenceGenerator 和可选取消信号。首次补齐只接受 not_extracted 且无历史绑定；相同哈希复用版本。返回 extracted 时，version 与 evidence 一起传给下游，不再传原始未补齐版本。

paused 包含论文及版本 ID、新旧哈希、来源地址、获取时间和机器可读原因。函数不调用生成器处理暂停论文，不自动覆盖冲突或建立新版本。生成器失败和取消继续向调用方抛出，不伪装成哈希冲突。

返回的论文记录共享只读引用，不提供深冻结或持久快照。该库没有独立注册或单独维护的运行时服务观察，因此不发布 invariant 子路径；模型适配器直接使用已保存 Session 事件中的不可变请求数据，调用时核对存储内容。

## 有界研究草稿

`planCandidateBatch()` 是 B 的候选排序与 A 的全文工作流之间的 Q5 决策边界。它保持权威 P0/P1/P2 顺序，按调用方明确配置选择首批候选，后续优先选择已审核问题匹配能补充未覆盖或部分覆盖问题、且尚未调度的候选。如果已有排序候选无法补足需求，它返回 Brief 中需要补证的原始问题，由 B 生成缺口查询，而不会自行编造检索词。函数对目标与覆盖达成、纳入上限、饱和、检索轮次与候选上限、时间、取消、人工审核及候选耗尽返回稳定停止决定。该函数是可重放的纯决策；调用方在启动网络或模型工作前持久化输入和已完成批次事实。批次大小必须由调用方策略明确传入，不是包内隐藏常量。

排序调度在权威排序旁保留审核过的 `CandidateAssessment`。排序、覆盖、批次决定、批次结算、缺口轮次或终态停止发生变化时，`runResearchDraft()` 发布完整的 `AcademicQueryWorkflowObservation` 快照。每份快照包含单一运行身份、运行内单调序号、准确计划和 Brief 版本、关联的论文与版本、权威队列、已完成轮次、绝对批次事实、当前逐题覆盖和已记录的停止决定。浏览器类型消费者通过仅含类型的 `@deepseek-ai/dsh-academic-workflow/query-workflow` 入口导入这些字段。最新快照保留在 `DraftPipelineResult.queryWorkflow`；没有排序调度的旧选择器不提供该字段。观察者异常不能改变研究结算。

当 `PaperSelectionResult.candidateScheduling` 存在时，`runResearchDraft()` 按调度器批次逐批执行所选全文候选。每批完成后，工作流只依据通过原文核对、且本次运行的 `EvidenceQuestionLink` 明确指向该批准问题的证据重建覆盖，统计独立支持论文数，再向调度器请求下一步。候选级 `matchedQuestions` 可以调度可能相关的论文，但不能证明证据支持。未覆盖和部分覆盖的问题保留明确的结构化缺口。当前没有可解析全文交接的候选不占用有界 Q5 队列。调度器要求证据缺口补检时，本次草稿运行以明确限制结束；自动执行新增检索轮次及为 Session 恢复持久化批次决定仍留待后续。

候选按选择顺序启动并结算，最多同时进行 `paperConcurrency` 篇获取和抽取（省略为 1）。前序慢论文可能延迟按序结算与补选。每篇未结算候选预留一个纳入名额，可用证据论文加预留数不得超过批准的纳入上限；排除、暂停、失败和空证据释放名额。每次结算后检查独立论文与全文下限。启用 `stopWhenEvidenceRequirementsMet` 且这些下限及 `targetIncludedWorks` 均达标时不再启动新论文，已启动论文完成后再分析，因此可在纳入上限内超过目标数量。取消停止新任务并等待在途任务收尾；持久记录失败中止其他任务，等待收尾后向上抛出。覆盖说明区分证据达标、纳入上限、选择器截断和候选耗尽，不只统计下载。查询及研究要求保持不变。

runResearchDraft 接收已批准的 Brief、一至三条带有已批准 `academic` 和／或 `web_discovery` 渠道的有序明确查询，以及 synthetic 标记；查询数还必须符合 Brief 的 `maximumSearchRounds`。它先按顺序执行查询，再执行合并去重 → 选择版本 → 逐篇全文解析与证据抽取 → 分析 → 带评测的草稿报告；每篇最多一个版本，全部选择先校验再开始全文获取。

`executeHybridSearch()` 是单条已批准查询的策略感知发现单元。它同时启动学术源直接检索与 DSH Web 发现，从有界 Web 候选中识别 DOI、arXiv、ACL、PMLR、CVF 引用，删除完全一致的重复引用，执行已批准的核验 Provider 白名单和尝试上限，并且只把核验成功的论文放入 Academic 批次。重复引用只核验一次，但保留每个发现 URL 及其核验 Provider。直接检索与 Web 核验记录先按精确标识符归并，再把候选上限用于不同成果；每个保留成果的不同版本继续保留，因此返回的记录数可能超过 `maxResults`。单个渠道或引用失败时保留其他成功结果；调用方取消会终止整个操作。返回的观察值分别统计学术记录、Web URL、已识别引用、核验尝试与核验结果，供后续 Remote 投影使用。调用方显式提供四项操作，因此 Provider 定位仍归 Academic Source，通用 Web 访问仍归 `ctx.web`。

调用方提供 search、selectPapers、fetcher、generator、synthesize 和 now。search 返回 `ctx.academicSource.searchAll()` 的 `AcademicSourceSearchBatchResult`，fetcher 可适配 ctx.web.fetch。`selectResearchPapers()` 通过由提供方负责的全文地址解析器应用确定性的版本、日期、论文类型、撤稿和预印本规则；其 `PaperSelectionResult` 记录候选选择器是否遗漏了另一篇符合条件的论文。生成器与时钟显式注入，不在本库读取密钥、创建网络客户端或添加通用调度框架。

调用方还可以提供 `onProgress`。工作流随后为检索、筛选、全文、证据抽取、洞察分析和报告生成发布完整且序号单调递增的运行内快照。查询活动在执行前携带已批准渠道，包括 Web 发现失败的情况。摄取观察来自摄取包，分别记录合并的论文身份、合并的版本记录、保留版本和疑似重复。并发论文活动同时携带论文与版本身份。每个 Academic Source Provider 在请求开始时产生运行活动，并在结算时产生成功、失败或取消活动；工作流使用查询位置和自身时钟为这些事实补齐上下文。混合检索编排器还在 Web 发现、汇总引用识别和每一条有界引用核验的真实调用点发布相同生命周期；操作名与从一开始的核验位置把这些事实和学术源直接检索区分开。单篇论文或单个 Provider 失败不会清空其他成功论文和已验证证据，取消终态保留此前已经提交的全部计数。报告生成在质量检查前发布 `evaluation`，在 Markdown 组装前发布 `rendering`；模型综合仍属于分析阶段。订阅者异常会被隔离，不能改变研究结算。模型内部的分段和重试序号继续保持 `null`，直到所属适配器发布事实。这些快照不包含 `sessionId`，也不是 Remote 流；该投影由 Controller 负责。

每条查询使用相同候选上限。已完成查询批次按轮转顺序合并，避免前一条查询独占全局名额；随后按精确标识符去重，把所有已返回论文交给日期、版本状态和全文地址初筛。只有合格论文占用全局候选名额，上限取 `maximumCandidateWorks` 与请求上限的较小值。地址解析不下载全文，也不保证全文能够成功解析。单查询发现与引用核验仍在结果进入本工作流前受各自上限约束。`coverageSummary.deduplicatedWorks` 记录各查询实际返回的记录经过跨查询去重、但尚未应用本轮全局候选上限时的数量；`academicWorkIds` 保存通过校验的已选候选；在选文前中止时保持为空。选择返回 `maximumCandidateWorks` 内的合格候选池；处理在有可用证据的论文达到 `maximumIncludedWorks` 时停止。未批准输入、查询过多、重复选择同一成果、未知版本和撤稿等非法选择会被拒绝。某条查询得到来源失败批次时仍继续后续明确查询；配置错误或无法表达为批次结果的搜索错误仍向上抛出。哈希冲突返回暂停结果；模型范围排除保留原因且不产生证据。全文或抽取失败记录论文版本与失败阶段，其他论文继续。已知抽取失败会在不暴露模型输出的前提下精确分类：非法模型 JSON/内容为 `parse_failed`，缺少模型预算为 `invalid_request`，模型输出未完成为 `upstream_error`，其他抽取失败为 `unknown`。终态 `RetrievalRun` 合并来源与论文失败、去重及纳入成果数、成功取得全文数、实际调用的 Provider、实际开始执行的查询和明确的截断原因。报告披露相同的不完整覆盖观察，不把结果标成完整覆盖。

输出 status=completed 仅表示本轮完成，不代表研究充分或审核通过。`retrievalRun.status` 根据已纳入成果和记录的失败独立表示成功、部分成功或失败；全部来源失败会返回阻塞草稿和失败的检索运行。report 始终使用草稿模式和空语义审核，质量状态由 report.evaluation 给出。取消返回 cancelled、已完成论文、失败与已观察覆盖，不生成报告。配置错误及无法表达为批次结果的搜索失败向调用方抛出。调用方负责模型与网络持久记录及取消；Plan 非空的 maximumElapsedMinutes 为检索、抽取和洞察共用的操作信号增加截止时间。

Academic Controller 为已批准的第 3 版和第 4 版查询挂载混合执行器，并保留历史纯学术路径。`DraftSearchResult.hybridObservation` 经流水线进入可选的 `hybridSearch` 运行事实。已完成查询保留观察，中断查询仅在 RetrievalRun 限制和已启动查询中披露。实际进入的记录、精确合并记录和不同论文数从整轮论文上限应用前的 ingestion 结果结算。观察值保留单查询版本归并前的原始贡献记录，避免同一版本的归并抹掉重复计数。重复引用及被单查询上限排除的记录不算论文合并。Controller 投影这些事实，不返回原始 Web 内容。自动扩展查询、跨运行恢复、摘要降级和最终发布仍不属于本轮能力。

## 模型回答校验

`parsePaperModelResponse(text)` 接收一个包含范围决定、原因和最多六项证据的 JSON 对象；每项必须携带非空且互不重复、从零开始的 `questionIndexes`，抽取阶段把它们映射回获批关注问题原文，并逐条拒绝越界关联。`parseEvidenceDrafts(text)` 返回其中的 EvidenceDraft 值。校验要求被排除论文的证据数组为空，并在返回任何草稿前检查数量限制、六类卡片、必填字段、枚举和 Availability 值。接受空证据和空 cardItems；条目超限、未知字段、编造身份、failed 可用性及格式错误抛出代码为 EVIDENCE_INVALID_MODEL_OUTPUT 的 EvidenceError。错误指出字段位置，不复制模型回答内容。

模型没有生产方生成的真实失败 ID，因此拒绝 failed 可用性；缺失信息仍可使用 unknown、not_applicable 和 not_extracted。段落索引范围和原文摘录检查继续由 B 负责。解析本身不验证语义支持、流式输出是否完整或输入预算；调用方必须在解析前拒绝未完整结束的模型输出，并自行持久记录原始回答。该函数不调用模型，也不记录 Session。

## 带会话记录的模型抽取

论文处理结果区分 `extracted`、`partially_extracted` 与 `extraction_failed`。部分抽取成功论文的合格记录携带原有来源信息参与分析，被拒草稿不会进入卡片或报告引用。全部草稿被拒的论文仍保留处理结果，但不计入实际纳入论文。每篇受影响论文记一次 `extract_evidence` 失败操作，不按被拒条目数重复计数；逐条序号和原因保留在 `evidence.rejectedDrafts`。覆盖限制与报告限制披露保留和拒绝数量。这不会增加模型重试，也不放宽整份 JSON 的结构校验；JSON 的 `validated` 状态与逐字原文核验不同。

将 `createModelEvidenceGenerator(ctx, session, config, policy)` 绑定到具有活动持久化写入器的 Session，并显式传入 `LlmCallConfig` 和正数 `maxAttempts`。上下文需要 llm、sessions、sessionPersistence 和 tokenMeter。配置的提供方解析模型容量和输出上限；缺少容量或上限时，该论文在发送前失败。`inputBatchTokenLimit` 按完整包装输入的估算值切分有序来源片段；单个过大片段按 `inputBatchOverlapCharacters` 重叠切分，局部片段序号在来源核验前映射回原始序号。`attemptTimeoutMs` 限制每次发送的准备与流式接收时间。输出上限和配置允许的瞬时故障可以重试；工具调用、非法 JSON、不支持的内容、准入失败和外部取消不会重试。调用方选择模型路由和全部部署限制。

返回的 PaperEvidenceGenerator 接收 B 的请求、解析来源信息和批准的自然语言范围规则，可直接作为 runResearchDraft 的 generator。B 接收的 EvidenceGenerationRequest 不变；由 A 的包装层把调用关联到论文、版本、内容哈希、来源、抽取方法及范围决定。

应用调用方使用 `runAcademicResearchDraft({ ctx, session, model, modelPolicies, input, adapters, signal })`。`modelPolicies.evidence` 与 `modelPolicies.synthesis` 分别选择尝试次数、可重试的瞬时故障代码和首次等待时间；合成还可通过 `retryInvalidOutput` 在同一次数上限内启用整份响应的结构恢复。这个稳定入口会在检索或全文获取前检查准确模型路由。没有指定推理强度时使用模型路由默认值；调用方明确指定的值会被保留并校验。明确指定但不支持的推理强度会在外部论文处理开始前失败。结果在逐篇状态、失败、分析和报告之外带回 `sessionId` 与终态 `retrievalRun`，供调用方定位持久化模型记录并展示实际覆盖情况。

`runModelResearchDraft(ctx, session, config, policies, input, adapters, signal)` 继续作为较底层的组合入口。adapters 提供 search、selectPapers、fetcher 和 now；它按各自策略绑定抽取与合成生成器，沿用既有流水线连接 B 的解析/证据和 C 的分析/评测草稿。两个入口都不拥有 Session 生命周期。Brief 批准、选文策略、期限、报告保存和发布仍由调用方负责。

每次尝试的请求和结果记录都带有尝试序号与上限，先追加事件，经 SessionStore 刷新，再从持久化存储读回后才继续。缺少写入器、追加失败、保存被拒绝或存储内容不一致会抛出 WorkflowLogError 并停止整轮，包括与取消同时发生的情况。结果记录不随模型请求取消。流式接收期间进程崩溃可能留下无结果的请求记录；尚未实现自动恢复。

论文结算时，工作流在把证据交给分析之前，独立保存通过原文核对的合格抽取记录。报告把这份批次作为 `admittedEvidence`；新增或被改写的引用证据会被拒绝，草稿也不例外。后端报告的 `retrievalDisclosure` 来自已完成查询、批准预算、实际计数和失败。网页摘要和候选 URL 不成为报告证据或参考文献。身份核验成功但全文地址解析失败时，保留核验成功，并单独记录 `resolve_fulltext` 失败。

## Model Experience

### 带会话记录的模型抽取

#### What the model sees

`createModelEvidenceGenerator()` 将 B 的指令、批准的纳入和排除规则、范围决定与六栏 JSON 返回要求、研究问题及全部有序正文/定位片段作为无工具请求发送。程序持有的来源 Provider 和来源 URL 随正文片段一同发送，范围审核可据此确认已有的官方来源或稳定标识，不要求正文再次写出该标识；这些元数据不能支撑研究结论。模型先记录全文是否符合范围规则及原因；被纳入论文只选择直接回答研究问题的证据，总数最多六条，以一个研究问题为主要依据的证据最多三条，并避免穷举整篇论文。数据集、基准分数、硬件、训练时长及常规超参数只有在直接回答研究问题时才可纳入。请求数据来自不可变的 academic/evidence-request 事件；academic/evidence-result 保留无损压缩流、提供方给出的用量以及 validated/failed/cancelled/skipped 状态。validated 仅代表 JSON 校验通过。这些仅用于记录的事件不进入主对话历史。

#### Token effect

DSH 现有消息估算器计算完整包装后的输入。启用分批后，每批既要满足配置的输入上限，也要在为输出 token 预留空间后符合模型上下文容量。成功批次按来源顺序合并，去除重复草稿，最多六条进入逐字来源核验。一个批次失败时保留其他已校验证据，并把论文标为部分抽取；全部批次失败才使论文失败。该估算不是精确分词，提供方仍可能拒绝被放行的请求。

#### KV Cache effect

每次抽取只发送本篇论文请求，不重放主对话；不保证跨论文缓存复用。

### Evidence handoff

#### What the model sees

`extractPaperEvidence()` 不新增提示词；仅在交接成功后调用 B 的抽取器及调用方提供的生成器。

#### Token effect

交接本身不消耗模型 token，抽取调用的 token 与请求记录由调用方负责。

#### KV Cache effect

不修改模型缓存策略。

## Known Limitations and Deferred Work

- 该库提供有界明确查询草稿流水线、单篇交接和显式启用的模型适配器。`@deepseek-ai/dsh-academic-workflow/recovery` 类型入口固定归一化恢复契约，根入口导出的 `reconstructAcademicResearchRecoveryState()` 则从一份完整且有序的 Session 日志执行纯 A-S2 重建。A-S3 会在每个排序批次开始前和结算后持久化可安全序列化为 JSON 的可执行检查点。Session 后端接受 `resumeRetrievalRunId`，取得 Session 写入句柄，校验检查点与已批准计划及已提交批次历史一致，跳过检索和筛选，保留原运行身份，不重复已结算批次，并把一个未结算批次作为整体重新执行。没有检查点的历史未完成运行返回 `candidate_state_missing`。恢复后的保留候选池不会开启新的证据缺口检索轮次，因为来源运行时解析缓存尚未持久化。自适应查询规划和最终语义审核仍留待后续；来源 Provider 可以在自身配置上限内重试临时传输失败。它不证明文件的学术身份，也不判断格式差异或内容改版。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>Working context for maintainers</summary>

设计与验证见[论文交接决策](../../../.agents/notes/implemented/architecture/2026-09-15-academic-paper-handoff.zh.md)、[明确查询编排决策](../../../.agents/notes/implemented/architecture/2026-09-18-academic-explicit-query-orchestration.zh.md)、[证据抽取恢复决策](../../../.agents/notes/implemented/architecture/2026-09-20-academic-evidence-extraction-recovery.zh.md)、[混合检索决策](../../../.agents/notes/implemented/architecture/2026-09-22-academic-hybrid-retrieval-contract.zh.md)、[研究恢复状态决策](../../../.agents/notes/implemented/architecture/2026-10-09-academic-research-recovery-state.zh.md)及[测试](tests/handoff.spec.ts)。

</details>
