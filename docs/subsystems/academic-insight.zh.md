---
description: "学术洞察的所有权与依赖方向。"
kind: "subsystem"
---

# 学术洞察子系统

[English](academic-insight.md) | 中文

分析本地 `AnalysisInput` 和报告本地 `ReportInput` 通过可选的 `questionLinks` 接收生产方问题与证据关联，不改变 Academic Model 或 Remote 字段。卡片分区为空时仍保留逐条有效的最小证据；未提供问题关联时明确披露而非推断。工作流集成负责人负责转发这些可选关联。

Trace v1 通过模型的仅类型 trace 子路径共享品牌操作与事件身份。当前 Controller 适配器保存安全观察记录，标准化后交给不依赖基座的分页；Web 面板只读取限定范围的 Remote 页面。报告 HTML 导出使用现有 Markdown 渲染器与惰性允许列表序列化，保留质量和证据链接，不引入外部资源。查询与导出细节见 [Controller](../../packages/api/academic-research-controller/README.zh.md)和[查看器](../../packages/client/ui-academic-research/README.zh.md)。

## 概述

学术洞察是建立在 Harness 扩展点上的可选业务子系统。共享模型不依赖具体提供方；检索、证据生产、跨论文分析、工作流编排与界面分别由独立消费者负责。

正式研究默认选择最小深度证据抽取，把已核验记录和对应的批准问题送入已评测报告，由 auto 模式按交付检查选择正式报告或草稿；未覆盖的问题继续列为缺口，零有效证据不生成报告。用户可在一级报告结束后选择一篇已有有效证据的论文进行完整深度增强。现有 `AcademicEvidenceEnhancementRequest` 使用 `sessionId`、`retrievalRunId` 和 `workVersionId` 标识这次增强。`AcademicEvidenceEnhancementView` 返回相同身份、`completed` 或 `partial_success`，以及 `initialEvidenceRecords`、`addedEvidenceRecords` 和 `incompleteFragments`。选择及终态事实独立持久化；失败或取消可保留先前已核验片段，不授予语义审核通过状态，也不替换原报告。客户端通过既有 Session 日志读取新增摘录，不根据数量生成内容。

## 依赖方向

`packages/academic/model` 是学术业务的最底层。它可以依赖共享工具，但不能依赖提供方、工作流、报告渲染器或客户端包。上层学术包向内依赖本模型。

## 成员所有权

成员 A 负责共享模型、工作流接口和集成决策。成员 B 负责学术检索、候选评估与提供方规范化。成员 C 负责研究计划与候选界面。现有证据、分析和报告包继续由各自模块维护。

共享记录变更由成员 A 维护，防止提供方和报告专用逻辑进入通用模型。

## 证据到报告消费方

证据库还提供可选的[增量抽取](../../packages/academic/evidence/README.zh.md#incremental-extraction)。片段尝试将论文／版本身份绑定到原始来源坐标；必需的已验证结果保存接口在后续发送前提交成功片段。可恢复失败和未完成范围与已接受证据分别保留。工作流负责模型阶段输出额度、持久记录、论文范围审核和临时降低并发。

[证据库](../../packages/academic/evidence/README.zh.md) 返回合格记录与 `EvidenceExtractionResult.rejectedDrafts`。每条拒绝记录包含从零开始的 `draftIndex` 和 `segmentIndex`、稳定的 `code`，以及不含原文的诊断 `reason`。工作流提供 `extracted`、`partially_extracted` 或 `extraction_failed` 论文结果；只有前两类向分析提供证据。Academic Remote 为每份抽取结果投影合格 `evidenceCount` 和拒绝列表。部分抽取成功的论文同时贡献保留证据和一次失败抽取操作，全部被拒的论文不计入实际纳入成果。

分析、评测和报告消费方分别由[分析库](../../packages/academic/analysis/README.zh.md)、[评测库](../../packages/academic/eval/README.zh.md)和[报告库](../../packages/academic/report/README.zh.md)实现。分析使用共享 Claim 记录，评测核对当前证据与已提供的语义审核；缺少独立审核会披露但不阻止其他检查通过的交付，已提供但无效的审核仍会阻断。报告在最终交付入口执行这些检查。[独立查看器](../../packages/client/ui-academic-research/README.zh.md)提供 HTML 与 Markdown 下载，并通过 Web 侧栏真实 Remote 页面分别展示运行、检索和报告质量状态。整理与交付视图归各自模块所有，论文身份与证据记录仍由共享模型维护。

[摄取库](../../packages/academic/ingestion/README.zh.md)接收可附带已核验 Web 发现 URL 和核验 Provider ID 的 `IngestRecord`。按精确标识符去重后，`IngestOutcome.verifiedDiscoveries` 把这些值关联到分配的 `AcademicWorkId` 和保留的 `WorkVersionId`；不同版本仍可分别寻址。

[检索库](../../packages/academic/retrieval/README.zh.md)根据已批准 Brief 与调用方审核过的扩展词生成按渠道区分的查询。单轮执行器只在学术引用完成核验后纳入 Web 发现结果，再交由摄取库按精确标识符和版本合并。排序器对审核过的语义判断应用批准的硬过滤和加权 P0/P1/P2 阈值，再按来源、团队、问题和主题多样性排列各队列。查询 ID 保留在评估后的成果上；Academic Controller 负责计划审核与 Session 记录。

## 初始阶段

本模型定义不透明 ID、五态 `Availability<T>`、学术成果、不可变版本、部分日期、提供方记录、精确外部标识符去重键、必须获得当前版本批准的版本化研究简报、可追溯证据、六分区证据卡和不可变证据快照。不依赖提供方的失败、批处理结果和实际覆盖统计定义在[模型包](../../packages/academic/model/README.zh.md)。正常的空搜索结果仍是成功；部分失败保留成功项，截断覆盖必须说明原因。RetrievalRun 将按顺序执行的查询、提供方、覆盖统计和失败绑定到 Brief 版本。六阶段 ResearchStage 将生命周期与最终批处理结果区分；未结束的阶段不携带最终状态或结束时间。工作流消费者负责批准校验和阶段流转。ClaimRecord、ClaimEvidenceLink 和 ClaimAssessment 保存结论、支持或反对证据及审核方法及已评估证据身份。checkClaimFreshness 将分析快照与当前 Brief 和证据比较，不修改记录。已知变化为 stale，缺失证据或哈希为 unverifiable；current 不代表语义审核通过。持久化解析和执行仍不属于这些共享记录。

[workflow 库](../../packages/academic/workflow/README.zh.md)补齐首次取得的版本哈希，并执行一次有界的明确查询到草稿流程。它在已批准 Brief 轮数限制内按顺序执行最多三条由调用方规划的查询，按轮转顺序合并查询批次，按精确身份去重，再应用一个全局候选上限。它返回包含实际 Provider、实际开始的查询、覆盖、截断及来源或论文操作失败的终态 RetrievalRun；Remote 控制器把该 JSON 安全运行记录提供给 Web 客户端。排序调度还发布完整的查询工作流观察；Controller 把其中的计划、候选、轮次、批次、逐题覆盖和停止决定投影为序号单调递增的 `AcademicQ6Projection` 帧，并在终态结果中重复最后一帧。运行内进度快照分别记录合并的论文身份、合并的版本记录、保留版本和疑似重复；论文活动同时携带论文与版本 ID，共享格式接受 Provider 活动。显式启用的模型适配器接收程序维护的来源元数据，保留证据生成器请求接口。PaperEvidenceGenerator、PaperScopeDecision、EvidenceModelSource、EvidenceModelRequest 和 EvidenceModelResult 定义在[工作流类型](../../packages/academic/workflow/src/model-types.ts)中。模型先用首个证据批次和获批规则判断论文准入；排除论文跳过抽取，材料不足则暂停。纳入论文使用简化的证据回答处理有序且受 token 限制的批次，在逐字来源核验前恢复原始定位序号。每次尝试可设置独立超时和有界瞬时故障重试；一个批次失败时保留其他已校验批次。请求事件包含来源身份、阶段、准确的模型配置/消息、输入估算、上下文/输出上限及准入决定；结果引用请求序号，保留压缩流、状态及可选的结束原因、用量、错误代码和本机耗时诊断。没有阶段字段的历史事件仍可读取。存储失败停止整轮。当前不提供自动查询规划。这些 Session 记录支持模型调用复查，不代表完整工作流恢复或语义审核。

候选选择在有界模型审核前调用 Retrieval 覆盖选择器，部署审核预算独立于 Plan 候选上限。Controller 的[审核策略](../../packages/api/academic-research-controller/README.zh.md#model-experience)限制最多两个并发，以版本化 Session 事件记录最小请求和已验证判断，并通过 Q6 投影明确的 `CandidateAssessment.semanticReview` 结算。筛选进度分别报告审核数量与去重论文总数，跳过的论文保留词项评估。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxacademicresearchcontroller--academicresearchcontroller"></a>

### `ctx.academicResearchController` — `AcademicResearchController`

Host service backing the generated `ctx.remote.academicResearch` namespace.

```ts cordis-catalog
/**
 * Preview the latest approved plan without starting retrieval or calling a model.
 * @param sessionId Session whose research plan the user wants to execute.
 * @returns Chinese research intent, search directions, and the approval identity to pass to run.
 */
@Remote('plan') async plan(sessionId: AcademicResearchRunRequest['sessionId']): Promise<AcademicResearchPlanView>

/**
 * Run one multi-source research pass while the addressed Agent is idle.
 * @param request - previewed approval identity, disclosure, and the Session containing the plan.
 * @param signal - Remote caller lifetime; disconnect or cancellation aborts the pass.
 * @returns completed or cancelled draft data with its observed retrieval run and durable Session identity.
 */
@Remote('run') async run(request: AcademicResearchRunRequest, signal: AbortSignal): Promise<AcademicResearchRunValue>

/**
 * Enhance one user-selected paper after its first-tier draft has settled.
 * @param request Completed run and selected paper identity.
 * @param signal Caller lifetime; cancellation preserves the original report and committed fragments.
 * @returns Separate evidence counts; this operation does not revise or approve the original report.
 */
@Remote('enhanceEvidence') async enhanceEvidence(request: AcademicEvidenceEnhancementRequest, signal: AbortSignal): Promise<AcademicEvidenceEnhancementView>

/**
 * Stream complete workflow progress snapshots followed by one final result.
 * @param request - previewed approval identity, disclosure, and the Session containing the plan.
 * @param signal - Remote caller lifetime; disconnect or cancellation aborts this one pass.
 * @returns ordered progress frames and at most one terminal result frame.
 */
@Remote({ mode: 'stream' }) runStream(request: AcademicResearchRunRequest, signal: AbortSignal): AsyncIterable<AcademicResearchRunFrame>

/**
 * Start a Session-owned research task whose lifetime does not depend on the browser connection.
 * @param request Approved plan identity and bounded run options.
 * @param signal Caller lifetime used only before admission; disconnect after admission leaves the task running.
 * @returns Persisted initial state and its independent background run ID.
 */
@Remote('startBackgroundRun') async startBackgroundRun(request: AcademicResearchRunRequest, signal: AbortSignal): Promise<AcademicBackgroundRunView>

/**
 * Read the latest Session-owned task state, including after a host restart.
 * @param key Session and background run identity.
 * @returns Latest durable state; an unclosed task from a previous host is marked interrupted.
 */
@Remote('getBackgroundRun') async getBackgroundRun(key: AcademicBackgroundRunKey): Promise<AcademicBackgroundRunView>

/**
 * Find this Session's recent task IDs after a page refresh or reconnection.
 * @param sessionId Owning Session identity.
 * @returns At most 20 small discovery rows, oldest first, with live tasks overriding persisted snapshots.
 */
@Remote('listBackgroundRuns') async listBackgroundRuns(sessionId: AcademicResearchRunRequest['sessionId']): Promise<readonly AcademicBackgroundRunSummary[]>

/**
 * Subscribe to a task without taking ownership of its lifetime.
 * @param key Session and background run identity.
 * @param signal Subscriber lifetime; disconnect only ends this subscription.
 * @returns Current view followed by live updates, or one terminal/recovered view.
 */
@Remote({ mode: 'stream' }) async *watchBackgroundRun(key: AcademicBackgroundRunKey, signal: AbortSignal): AsyncIterable<AcademicBackgroundRunView>

/**
 * Explicitly cancel an active task; closing a viewer never calls this method.
 * @param request Session-owned run identity and user cancellation reason.
 * @returns Latest state, including the durable cancellation intent.
 */
@Remote('cancelBackgroundRun') async cancelBackgroundRun(request: AcademicBackgroundRunCancelRequest): Promise<AcademicBackgroundRunView>

/**
 * Read safe diagnostics for one owned Session/run without starting or cancelling research.
 * @param query Scope, stage/state filter, stable cursor and page bound.
 * @param signal Viewer request lifetime; never cancels research.
 * @returns Latest-operation page, or explicit absence for historical runs.
 */
@Remote('traceList') async traceList(query: AcademicTraceQuery, signal: AbortSignal): Promise<AcademicTracePage>

/**
 * Read an operation's original observations under the same scoped pagination rules.
 * @param query Session/run scope and required span identity.
 * @param signal Viewer request lifetime.
 * @returns Operation and its chronological observations; raw model content is excluded.
 */
@Remote('traceDetail') async traceDetail(query: AcademicTraceQuery, signal: AbortSignal): Promise<AcademicTracePage>
```

Source: [`packages/api/academic-research-controller/src/index.ts`](../../packages/api/academic-research-controller/src/index.ts)
<!-- END GENERATED cordis-surface -->

`AcademicBackgroundRunKey` 把 Host 拥有的任务 ID 绑定到 Session；`AcademicBackgroundRunCancelRequest` 增加明确的 `user_requested` 原因。`AcademicBackgroundRunView` 将最新状态、进度、Q6 投影和终态结果作为一条完整 Session 事件保存。`AcademicBackgroundRunSummary` 是 `listBackgroundRuns` 返回的简短发现行；客户端另行读取选中运行的完整状态。订阅者的 AbortSignal 只结束查看。没有活动 Host 所有者的未结算记录显示为 `interrupted`，保留最后观察到的检索 ID 和进度；检查点恢复是一次显式新运行。

逐题洞察由[分析库](../../packages/academic/analysis/README.zh.md)负责，通过[工作流](../../packages/academic/workflow/README.zh.md)调用模型。`AcademicSynthesisInput` 绑定批准的 Brief 版本、RetrievalRun 身份、准入分析记录与观察到的覆盖统计。`AcademicSynthesisDraft` 包含带引用的陈述、每个问题按序对应的回答、章节、局限，以及引用同一组陈述的可选方向组件。旧草稿缺少方向时保持问题式；新方向布局遵循[报告库](../../packages/academic/report/README.zh.md)。Remote 增加 `synthesis: { status: "not_run" | "blocked" | "failed" | "completed" | "partial_success", reasons: readonly string[] }`；检索统计仍只描述检索。问题回答不代表语义审核通过。 可选 writingStyle: evidence_narrative 在 C 报告渲染器中选择 B 式正文和结果表，不改变共享论文或 Controller 输入。

工作流导出 `AcademicResearchRecoveryState` 契约和纯 A-S2 折叠函数 `reconstructAcademicResearchRecoveryState()`。输入完整、有序的 Session 日志以及准确运行／Brief 身份后，它会重建已批准计划、已完成批次、有序待处理候选、最近一次已提交的覆盖和运行终态。A-S3 在排序批次边界增加持久化的可执行检查点。`run` 和 `runStream` 接受可选的 `resumeRetrievalRunId`；Controller 取得 Session 写入句柄、校验最近检查点、跳过检索和筛选、保留原运行身份、避开已结算批次，并把一个未结算批次作为整体重新执行。没有检查点载荷的历史未完成运行会明确返回 `candidate_state_missing`。

工作流在分析前保存通过原文核对的抽取结果，以 `admittedEvidence` 交给报告评测。后端报告追加实际检索披露，并返回可选的 `report.retrievalDisclosureIncluded: true`；客户端据此原样保留 Markdown，不再追加第二份附录。全文不可用的论文仍保留身份核验成功；`resolve_fulltext` 失败影响全文阶段，并在引用说明中保留分类。
