# Agent Note：学术排序候选分批调度

状态：已实施

[English](2026-09-30-academic-ranked-candidate-batch-scheduling.md) | 中文

## 问题

Q4 返回完整且有顺序的 P0/P1/P2/excluded 队列，但现有草稿流水线仍一次处理由元数据选择的候选池，没有一套可共享、可重放的首批全文、按问题缺口补选和终止原因决策。在工作流内重新排序会重复 B 的职责，也会使 Session 恢复无法保证相同结果。

## 决策

Academic Workflow 公开纯 Q5 决策边界 `planCandidateBatch()`。输入绑定准确的已批准 ResearchBrief、HybridSearchPlan、Q4 排序结果、问题覆盖、调用方配置的批次大小、已调度版本 ID、已完成批次与检索轮数、连续无新增证据批次、已纳入论文数以及终态运行事实。

首批保持 Q4 的 P0 顺序。后续批次保持合并后的 P0/P1/P2 顺序，同时优先选择 `matchedQuestions` 与 Brief 中未覆盖或部分覆盖问题重合的候选。如果目标论文数仍未满足，或问题之外的证据要求仍不满足，调度器继续从剩余权威顺序补选。它绝不使用 excluded 候选，也不修改分数、优先级或多样性顺序。

当已有排序候选无法补足剩余需求且仍有检索预算时，调度器返回 Brief 中准确的缺口问题，作为证据缺口补检请求；查询生成仍归 B。稳定停止决定覆盖目标与问题覆盖达成、纳入上限、饱和、检索轮次与候选上限、时间、取消、人工审核及候选耗尽。

批次大小必须由调用方策略明确传入。饱和与资源上限继续使用已批准的 ResearchBrief 或 HybridSearchPlan 数值。Controller 把准确的已批准计划持久化为 `academic/search-plan`，把每次调度决定持久化为 `academic/candidate-batch-decision`，把每批结算持久化为 `academic/candidate-batch-settlement`，把终态运行持久化为 `academic/run-settlement`。回读这些事件以恢复运行仍属于后续 Q5 工作。

## 影响

A 可以按 Q4 ID 调度，而不导入 B 的排序实现。B 可以从明确的未覆盖问题生成新查询，而不接管工作流状态。C 可以解释相同的批次原因与停止原因，不需要重新计算。使用同一份已保存输入重放会产生同一决定。

第 3 版 Controller 运行现在保留已审核的查询来源，取得 Q4 排序，把调度的 `WorkVersionId` 映射为可解析全文候选，逐批结算，依据通过校验的证据重建问题覆盖，并再次调用调度器。没有检索策略的旧计划保留原有选择路径。注册了 `replenishCandidates` 适配器的证据缺口决定会执行一轮证据缺口补检（`extendPlanForEvidenceGaps`，然后与已批准轮共用同一个 `executeHybridSearch` 执行器，再做 `ingestWorks` 合并、`rankPlannedCandidates` 重排）并继续调度；未注册适配器时运行仍以可见限制结束。从已持久化事件恢复运行仍留待后续。

## 验证

Workflow 聚焦测试覆盖 P0 首批顺序、按未覆盖问题补选、发出证据缺口补检、经补检适配器驱动一轮缺口补检、饱和停止，以及某批达到目标数量与问题覆盖后真实流水线停止。Controller 集成测试覆盖已核验全文复用，并证明未解析候选不会占用有界处理名额。包级类型检查与静态检查覆盖公共入口。

## 考虑过的替代方案

**由 Workflow 重新计算候选分数。** 这会产生第二套排序策略，并可能与 B 的解释不一致。

**一次处理全部排序候选。** 这样会在覆盖检查能够停止或调整运行前消耗全文与模型预算。

**由 Workflow 生成缺口查询。** 工作流只识别准确的缺失问题；查询扩展继续归 Academic Retrieval，使不依赖提供方的规划只有一个负责人。
