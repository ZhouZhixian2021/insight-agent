# 开发记录：B-CR1 候选语义审核解析与送审选择

## 范围与基线

本轮实现候选语义审核优化中属于 B 的部分，所属目录为 `packages/academic/retrieval/` 与 `packages/academic/model/src/query-workflow.ts`。当前分支为 `dev/yzyhello`，基线为已合并 PR #99 的 `3f780f5ee249b7662209ab09558e89ba24c41a63`。按约定不修改 A 的 Controller 运行接线与新版 Session 事件，也不修改 C 的评估、报告和客户端代码。

## 实现与交接

在 `packages/academic/model/src/query-workflow.ts` 新增并导出 `CandidateReviewSelectionDecisionV1` 与 `CandidateReviewSelectionV1`：前者含 `academicWorkId`、`workVersionId`、`routedQuestions`、`status`、`selectionOrder`、`selectionReason`（未选中时后两项为 null），后者含 `schemaVersion`、`maximumModelReviews`、`attemptedBefore`、`remainingBudget`、`decisions`。

新增公共函数 `parseCandidateSemanticReview(text, title, abstract, approvedQuestions)`，位于 `packages/academic/retrieval/src/parse-semantic-review.ts`。只接受 `schemaVersion`、`scope`、`matchedQuestions`；匹配问题必须是已批准 Brief 原文且不重复；每条引文必须逐字出现在规范标题或学术摘要中，摘要不可用时禁止摘要引文；偏题必须有引文且问题列表为空，可能相关必须至少匹配一个问题。无效 JSON、截断、超时与传输失败属于调用方失败，解析器直接抛 `RangeError`，不伪装成模型的 `unknown`。

新增公共函数 `selectCandidateReviews(brief, plan, ranking, assessments, attemptedWorkIds, maximumModelReviews)`，位于 `packages/academic/retrieval/src/select-reviews.ts`。合格候选是排序未硬排除、全文可解析且此前未尝试的论文；先按已批准研究问题顺序为覆盖名额分配（问题经 `discoveredBy` 路由，一篇可覆盖多个问题），再按词项初排补足剩余名额；比较键为优先级→学术摘要可用→评分降序→规范论文 ID；`selectionOrder` 从 0 起，原因记 `question_coverage` 或 `lexical_fill`。状态判定优先级为 `hard_excluded` > `fulltext_unresolvable` > `already_attempted` > `not_selected_budget`。`attemptedBefore = attemptedWorkIds.size`（含失败尝试），`remainingBudget = max(0, maximumModelReviews - attemptedBefore)`，即本次可选名额；预算独立于 Plan 候选上限和 P0/P1/P2 队列规模，查询路由不增加语义匹配分。

新增公共函数 `screeningFromSemanticReview(review)`，位于 `packages/academic/retrieval/src/semantic-screening.ts`，把通过校验的最小判断投影为只带 scope 与问题引文的初筛记录。`assessPlannedCandidates()` 调整合并口径：问题匹配始终来自模型语义结论；方法、证据类型和贡献分项在审核提供模型线索时使用模型线索，否则回落到代码计算的词项线索；明确偏题结论不计任何线索；本地 `surfaceKeywordHits` 与不确定项始终保留。这样语义审核不会把确定性词项线索清零，也不把词项线索标作已核实证据。`rank.ts` 无需改动：现有“参与计分的分项必须有逐字引文”校验在合并后仍由本地引用线索满足，`matchedQuestions` 与查询路由保持分离。

库内不写死审核上限；首版默认 8 由 A 传入。A 提到的"审核上限与 `maximumCandidateWorks` 做 `Math.min`"逻辑未出现在已提交代码中，符合方案所称"本地未提交"，属 Controller 接线，本轮不修改。

## 验证

- `npx vitest run packages/academic/retrieval`：5 个文件、61 个用例通过。新增 `tests/parse-semantic-review.spec.ts` 与 `tests/select-reviews.spec.ts` 覆盖相关/偏题/未知判断、额外字段、未批准或重复问题、捏造或来源不可用引文、矛盾范围结论、覆盖优先于补足、预算耗尽、整份预算被此前尝试占用、规范身份破同分，以及批准/排序/评估/预算不一致时的显式失败；`tests/rank.spec.ts` 新增用例固定最小审核在可能相关/未知范围保留代码计算线索、偏题不计线索、并保留本地 `surfaceKeywordHits`。
- `npx vitest run packages/academic/model packages/academic/workflow packages/api/academic-research-controller`：492 通过、1 失败（`packages/academic/workflow/tests/replenishment.spec.ts:39`）；stash 后在干净树复现，确认与本轮无关。
- `npx tsc -b packages/academic/retrieval`、`npx tsx scripts/run-oxlint.ts packages/academic/retrieval packages/academic/model`、`npx tsx scripts/verify-export-jsdoc.ts`：通过。
- `npx tsc -b tsconfig.json`：仅 `packages/client/ui-academic-research/src/client/index.ts` 的 `enhanceEvidence` Typert 类型未生成报错；经 stash 确认该错误与本轮无关，属既有状态。
- `npx tsx scripts/run-gates.ts doc-quick`：15 项全部通过；`npx tsx scripts/verify-translation-pairing.ts`：1213 对文档一致；`npx tsx scripts/verify-agent-note-format.ts`：格式通过。

## 后续与限制

A 负责 Controller 接线：传入首版 `maximumModelReviews`（默认 8）、移除与 `maximumCandidateWorks` 的 `Math.min` 上限、实现有界并发 2、取消与稳定归并、新版 Session 请求/结果事件，以及为每篇候选发布审核状态。C 负责固定候选质量评测与送审覆盖核对。本轮只交付纯函数与固定样例，尚未在真实运行中调用，因此没有新增录制会话或 GUI 录制；真实模型耗时、调用量、token 与语义质量基线属后续真实运行。

本轮没有执行全仓库测试、GUI 或真实模型冒烟。
