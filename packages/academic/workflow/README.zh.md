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

传入归并后的 WorkVersion、成功解析的 EvidenceExtractionInput、是否已有历史内容或证据的明确布尔值、EvidenceGenerator 和可选取消信号。首次补齐只接受 not_extracted 且无历史绑定；相同哈希复用版本。返回 extracted 时，version 与 evidence 一起传给下游，不再传原始未补齐版本。

paused 包含论文及版本 ID、新旧哈希、来源地址、获取时间和机器可读原因。函数不调用生成器处理暂停论文，不自动覆盖冲突或建立新版本。生成器失败和取消继续向调用方抛出，不伪装成哈希冲突。

返回的论文记录共享只读引用，不提供深冻结或持久快照。该库没有独立注册或单独维护的运行时服务观察，因此不发布 invariant 子路径；模型适配器直接使用已保存 Session 事件中的不可变请求数据，调用时核对存储内容。

## 一轮研究草稿

runResearchDraft 接收已批准的 Brief、一个明确查询和 synthetic 标记。调用顺序固定为检索 → 去重 → 选择版本 → 逐篇全文解析与证据抽取 → 分析 → 带评测的草稿报告；每篇最多一个版本，全部选择先校验再开始全文获取。

调用方提供 search、selectPapers、fetcher、generator 和 now。search 返回 `ctx.academicSource.searchAll()` 的 `AcademicSourceSearchBatchResult`，fetcher 可适配 ctx.web.fetch。`selectResearchPapers()` 通过由提供方负责的全文地址解析器应用确定性的版本、日期、论文类型、撤稿和预印本规则；其 `PaperSelectionResult` 记录批准的纳入数量上限是否遗漏了另一篇符合条件的论文。生成器与时钟显式注入，不在本库读取密钥、创建网络客户端或添加通用调度框架。

查询结果受 maximumCandidateWorks 与请求上限约束，选择受 maximumIncludedWorks 约束；拒绝未批准、重复论文、未知版本和撤稿等非法选择。哈希冲突返回暂停结果；模型范围排除保留原因且不产生证据。全文或抽取失败记录论文版本与失败阶段，其他论文继续。终态 `RetrievalRun` 合并来源与论文失败、去重及纳入成果数、成功取得全文数、实际调用的 Provider、执行的查询和明确的截断原因。报告披露相同的不完整覆盖观察，不把结果标成完整覆盖。

输出 status=completed 仅表示本轮完成，不代表研究充分或审核通过。`retrievalRun.status` 根据已纳入成果和记录的失败独立表示成功、部分成功或失败；全部来源失败会返回阻塞草稿和失败的检索运行。report 始终使用草稿模式和空语义审核，质量状态由 report.evaluation 给出。取消返回 cancelled、已完成论文、失败与已观察覆盖，不生成报告。配置错误及无法表达为批次结果的搜索失败向调用方抛出。模型与网络的持久记录、期限取消信号均由调用方负责。

自动多轮检索、重试、跨轮索引恢复、停止条件的饱和判定和达到证据量后的自动停止留待下一阶段；本轮不自动降级摘要或交付最终报告。主 Web 应用通过 `@deepseek-ai/dsh-api-academic-research-controller` 调用本工作流。

## 模型回答校验

`parsePaperModelResponse(text)` 接收一个包含范围决定、原因和最多六项证据的 JSON 对象；`parseEvidenceDrafts(text)` 返回其中的 EvidenceDraft 值。校验要求被排除论文的证据数组为空，并在返回任何草稿前检查数量限制、六类卡片、必填字段、枚举和 Availability 值。接受空证据和空 cardItems；条目超限、未知字段、编造身份、failed 可用性及格式错误抛出代码为 EVIDENCE_INVALID_MODEL_OUTPUT 的 EvidenceError。错误指出字段位置，不复制模型回答内容。

模型没有生产方生成的真实失败 ID，因此拒绝 failed 可用性；缺失信息仍可使用 unknown、not_applicable 和 not_extracted。段落索引范围和原文摘录检查继续由 B 负责。解析本身不验证语义支持、流式输出是否完整或输入预算；调用方必须在解析前拒绝未完整结束的模型输出，并自行持久记录原始回答。该函数不调用模型，也不记录 Session。

## 带会话记录的模型抽取

将 createModelEvidenceGenerator(ctx, session, config) 绑定到具有活动持久化写入器的 Session，并显式传入 LlmCallConfig。上下文需要 llm、sessions、sessionPersistence 和 tokenMeter。配置的提供方解析模型容量和输出上限；缺少容量或上限时，该论文在发送前失败。此处不自行设置模型名、密钥、超时或 token 上限；路由选择及取消/期限由调用方提供。

返回的 PaperEvidenceGenerator 接收 B 的请求、解析来源信息和批准的自然语言范围规则，可直接作为 runResearchDraft 的 generator。B 接收的 EvidenceGenerationRequest 不变；由 A 的包装层把调用关联到论文、版本、内容哈希、来源、抽取方法及范围决定。

应用调用方使用 `runAcademicResearchDraft({ ctx, session, model, input, adapters, signal })`。这个稳定入口会在检索或全文获取前检查准确模型路由。没有指定推理强度时使用模型路由默认值；调用方明确指定的值会被保留并校验。明确指定但不支持的推理强度会在外部论文处理开始前失败。结果在逐篇状态、失败、分析和报告之外带回 `sessionId` 与终态 `retrievalRun`，供调用方定位持久化模型记录并展示实际覆盖情况。

`runModelResearchDraft(ctx, session, config, input, adapters, signal)` 继续作为较底层的组合入口。adapters 提供 search、selectPapers、fetcher 和 now；它绑定模型生成器，沿用既有流水线连接 B 的解析/证据和 C 的分析/评测草稿。两个入口都不拥有 Session 生命周期。Brief 批准、选文策略、期限、报告保存和发布仍由调用方负责。

每次请求和结果都先追加事件，经 SessionStore 刷新，再从持久化存储读回后才继续。缺少写入器、追加失败、保存被拒绝或存储内容不一致会抛出 WorkflowLogError 并停止整轮，包括与取消同时发生的情况。结果记录不随模型请求取消。流式接收期间进程崩溃可能留下无结果的请求记录；尚未实现自动恢复。

## Model Experience

### 带会话记录的模型抽取

#### What the model sees

`createModelEvidenceGenerator()` 将 B 的指令、批准的纳入和排除规则、范围决定与六栏 JSON 返回要求、研究问题及全部有序正文/定位片段作为无工具请求发送。模型先记录全文是否符合范围规则及原因；被纳入论文只选择直接回答研究问题的证据，总数最多六条，以一个研究问题为主要依据的证据最多三条，并避免穷举整篇论文。数据集、基准分数、硬件、训练时长及常规超参数只有在直接回答研究问题时才可纳入。请求数据来自不可变的 academic/evidence-request 事件；academic/evidence-result 保留无损压缩流、提供方给出的用量以及 validated/failed/cancelled/skipped 状态。validated 仅代表 JSON 校验通过。这些仅用于记录的事件不进入主对话历史。

#### Token effect

DSH 现有消息估算器计算完整包装后的输入。输入估算加已解析的输出 token 上限必须不超过模型上下文容量；超限记录原因，经论文交接返回 input_too_large，不发送或截断正文。该估算不是精确分词，提供方仍可能拒绝被放行的请求。输入超限暂停及普通模型错误后，其他论文继续。

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

- 该库提供单轮草稿流水线、单篇交接和显式启用的模型适配器。Session 记录覆盖模型请求与结果；返回的 RetrievalRun、证据/卡片身份及完整工作流状态尚未持久化以供恢复。长论文分批、自动重试及最终语义审核留待后续。它不证明文件的学术身份，也不判断格式差异或内容改版。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>Working context for maintainers</summary>

设计与验证见 [论文交接决策](../../../.agents/notes/implemented/architecture/2026-09-15-academic-paper-handoff.zh.md) 及 [测试](tests/handoff.spec.ts).

</details>
