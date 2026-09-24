---
description: "学术洞察的所有权与依赖方向。"
kind: "subsystem"
---

# 学术洞察子系统

[English](academic-insight.md) | 中文

## 概述

学术洞察是建立在 Harness 扩展点上的可选业务子系统。共享模型不依赖具体提供方；检索、证据生产、跨论文分析、工作流编排与界面分别由独立消费者负责。

## 依赖方向

`packages/academic/model` 是学术业务的最底层。它可以依赖共享工具，但不能依赖提供方、工作流、报告渲染器或客户端包。上层学术包向内依赖本模型。

## 成员所有权

成员 A 负责共享模型、工作流接口和集成决策。成员 B 负责提供方规范化与单篇论文证据生产。成员 C 负责跨论文论断、覆盖度评估与报告呈现。

共享记录变更由成员 A 维护，防止提供方和报告专用逻辑进入通用模型。

## 证据到报告消费方

[证据库](../../packages/academic/evidence/README.zh.md) 返回合格记录与 `EvidenceExtractionResult.rejectedDrafts`。每条拒绝记录包含从零开始的 `draftIndex` 和 `segmentIndex`、稳定的 `code`，以及不含原文的诊断 `reason`。工作流提供 `extracted`、`partially_extracted` 或 `extraction_failed` 论文结果；只有前两类向分析提供证据。Academic Remote 为每份抽取结果投影合格 `evidenceCount` 和拒绝列表。部分抽取成功的论文同时贡献保留证据和一次失败抽取操作，全部被拒的论文不计入实际纳入成果。

分析、评测和报告消费方分别由[分析库](../../packages/academic/analysis/README.zh.md)、[评测库](../../packages/academic/eval/README.zh.md)和[报告库](../../packages/academic/report/README.zh.md)实现。分析使用共享 Claim 记录，评测结合当前证据与明确的语义审核，报告在最终交付入口执行核验。[独立查看器](../../packages/client/ui-academic-research/README.zh.md)提供 HTML 与 Markdown 下载，并通过 Web 侧栏真实 Remote 页面分别展示运行、检索和报告质量状态。整理与交付视图归各自模块所有，论文身份与证据记录仍由共享模型维护。

[摄取库](../../packages/academic/ingestion/README.zh.md)接收可附带已核验 Web 发现 URL 和核验 Provider ID 的 `IngestRecord`。按精确标识符去重后，`IngestOutcome.verifiedDiscoveries` 把这些值关联到分配的 `AcademicWorkId` 和保留的 `WorkVersionId`；不同版本仍可分别寻址。

## 初始阶段

本模型定义不透明 ID、五态 `Availability<T>`、学术成果、不可变版本、部分日期、提供方记录、精确外部标识符去重键、必须获得当前版本批准的版本化研究简报、可追溯证据、六分区证据卡和不可变证据快照。不依赖提供方的失败、批处理结果和实际覆盖统计定义在[模型包](../../packages/academic/model/README.zh.md)。正常的空搜索结果仍是成功；部分失败保留成功项，截断覆盖必须说明原因。RetrievalRun 将按顺序执行的查询、提供方、覆盖统计和失败绑定到 Brief 版本。六阶段 ResearchStage 将生命周期与最终批处理结果区分；未结束的阶段不携带最终状态或结束时间。工作流消费者负责批准校验和阶段流转。ClaimRecord、ClaimEvidenceLink 和 ClaimAssessment 保存结论、支持或反对证据及评审来源。checkClaimFreshness 将分析快照与当前 Brief 和证据比较，不修改记录。已知变化为 stale，缺失证据或哈希为 unverifiable；current 不代表语义审核通过。持久化解析和执行仍不属于这些共享记录。

[workflow 库](../../packages/academic/workflow/README.zh.md)补齐首次取得的版本哈希，并执行一次有界的明确查询到草稿流程。它在已批准 Brief 轮数限制内按顺序执行最多三条由调用方规划的查询，按轮转顺序合并查询批次，按精确身份去重，再应用一个全局候选上限。它返回包含实际 Provider、实际开始的查询、覆盖、截断及来源或论文操作失败的终态 RetrievalRun；Remote 控制器把该 JSON 安全运行记录提供给 Web 客户端。显式启用的模型适配器接收程序维护的来源信息，保留 B 的请求接口。PaperEvidenceGenerator、EvidenceModelSource、EvidenceModelRequest 和 EvidenceModelResult 定义在[工作流类型](../../packages/academic/workflow/src/model-types.ts)中。请求事件包含来源身份、准确的模型配置/消息、输入估算、上下文/输出上限及准入决定；结果引用请求序号，保留压缩流、状态及可选的结束原因、用量和错误代码。输入超限暂停不影响其他论文，存储失败停止整轮。当前不提供自动查询规划和重试。这些 Session 记录支持模型调用复查，不代表完整工作流恢复或语义审核。

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
```

Source: [`packages/api/academic-research-controller/src/index.ts`](../../packages/api/academic-research-controller/src/index.ts)
<!-- END GENERATED cordis-surface -->

逐题洞察由[分析库](../../packages/academic/analysis/README.zh.md)负责，通过[工作流](../../packages/academic/workflow/README.zh.md)调用模型。`AcademicSynthesisInput` 绑定批准的 Brief 版本、RetrievalRun 身份、准入分析记录与观察到的覆盖统计。`AcademicSynthesisDraft` 包含带引用的陈述、每个问题按序对应的回答、章节及局限。Remote 增加 `synthesis: { status: "not_run" | "blocked" | "failed" | "completed" | "partial_success", reasons: readonly string[] }`；检索统计仍只描述检索。问题回答不代表语义审核通过。
