# Agent Note: Academic 工作流向 Web 客户端返回实际检索覆盖

Status: implemented

[English](2026-09-17-academic-retrieval-run-projection.md) | 中文

## 问题

Academic 工作流只消费 `searchAll()` 中扁平的成功成果，因此来源失败、实际调用的 Provider、应用上限前的记录数和来源限制会在分析前丢失。Remote 结果虽然提供逐篇结果和草稿，但无法告诉 Web 客户端本次检索是完整成功、部分成功、失败，还是在保留部分观察后取消。

## 决策

`DraftPipelineAdapters.search` 消费 `AcademicSourceSearchBatchResult`。工作流摄取 `batch.items`、保留 `batch.failures`，并在完成或取消时结算一条 `RetrievalRun`。覆盖统计计算应用聚合上限前 Provider 返回的记录、摄取后的去重成果、进入分析的已抽取成果、成功取得全文的成果，以及全部已记录的来源、全文和抽取失败。本轮没有摘要或元数据降级，因此相应计数保持为零。

`selectResearchPapers()` 返回 `PaperSelectionResult`，其中包含所选论文和 `truncated`。选择过程只继续到观察到 `maximumIncludedWorks` 之外另一篇符合条件且可解析地址的论文，这可以证明数量上限遗漏了候选，而无需解析其余全部成果。来源声明的覆盖限制、来源截断或失败、已观察到的选择上限、论文操作失败和暂停论文都会把覆盖标记为截断，并加入不含凭据的限制说明。

论文全文和抽取失败继续保留既有 `PaperProcessingFailure` 视图，同时生成一条绑定所选来源与 `workVersionId` 的 `ProviderFailure`。全文获取使用 `fulltext_unavailable`，抽取使用 `parse_failed`；两者都使用固定消息，不复制捕获到的异常文本。存在已抽取成果和来源或论文失败时为 `partial_success`；存在失败但没有已抽取成果时为 `failed`；没有失败的正常空结果仍为 `success`。生命周期阶段保持独立：取消使用 `cancelled`，终态失败批次使用 `failed`，其他完成流程使用 `completed`。

`AcademicResearchRunValue` 必须包含工作流原样返回的 `retrievalRun`。品牌 ID 在运行时是字符串，所有嵌套字段均可安全序列化为 JSON，因此 Controller 不建立第二套浏览器专用运行类型。顶层完成/取消状态、检索批次状态和报告评测状态彼此独立。

## 考虑过的替代方案

**在 Controller 中建立覆盖统计。** 未采用，因为 Controller 无法在摄取、全文获取成功、模型范围判断及逐篇失败的提交点观察这些事实。

**从返回的论文推断 Provider 与失败。** 未采用，因为零结果和失败的 Provider 不会出现在论文记录中，论文也无法重建应用上限前的发现数量或来源限制。

**把每次完成的 Remote 调用都视为检索成功。** 未采用，因为所有 Provider 都可能失败，而有界流程仍会返回说明失败的阻塞草稿。

## 结果

固定 Web 样例与真实 Remote 响应共享必需的 `retrievalRun` 字段。Web 客户端无需检查论文数组即可展示部分成功、失败、取消、覆盖统计和限制。运行记录会随响应返回，但尚未持久化或流式发布；断线恢复、实时进度、重试、逐 Provider 统计、摘要降级和长论文分段不属于本决策范围。

工作流和 Controller 聚焦测试覆盖成功统计、部分及全部来源失败、论文失败、来源和纳入数量上限、取消及 Remote 投影。包 README 与 Academic 子系统页面维护面向调用方的行为说明。
