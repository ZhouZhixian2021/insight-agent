# Agent Note: 学术候选语义审核解析与送审选择

Status: implemented

[English](2026-10-20-academic-candidate-review-selection.md) | 中文

## Problem

候选模型审核给每篇论文发送完整初筛提示词，并取词项初排的前八篇，导致有限预算集中在同一个研究问题上，且长响应触及输出上限。`CandidateSemanticReviewRequestV1` 与 `CandidateSemanticReviewV1` 定义的最小模型交换缺少解析器与确定性的送审前选择，初轮与缺口轮共享的模型审核预算也没有与 Plan 候选上限区分开。

## Decision

`parseCandidateSemanticReview(text, title, abstract, approvedQuestions)` 只读取 `schemaVersion`、`scope` 和 `matchedQuestions`；匹配问题必须属于已批准 Brief，每条引文必须逐字出现在规范标题或学术摘要中。偏题和未知响应不携带匹配问题，判为可能相关时至少匹配一个问题。传输失败、超时、截断和无效 JSON 仍属调用方失败，不会变成模型的 `unknown`。

`selectCandidateReviews(brief, plan, ranking, assessments, attemptedWorkIds, maximumModelReviews)` 确定性地分配共享预算。合格候选是排序未硬排除、全文可解析且此前未尝试的论文。它先按每篇候选的 `discoveredBy` 路由为已批准问题分配名额，再按词项顺序补足剩余名额：优先级队列、学术摘要可用性、评分降序，最后用规范论文身份破同分。已尝试的论文即使调用失败也占名额，查询路由不增加语义匹配分。`CandidateReviewSelectionV1` 为每篇候选给出 `selected`、`not_selected_budget`、`hard_excluded`、`fulltext_unresolvable` 或 `already_attempted`，并携带从 0 开始的 `selectionOrder`、`routedQuestions` 以及 `question_coverage` 或 `lexical_fill` 原因。

`screeningFromSemanticReview(review)` 把通过校验的判断投影为初筛记录，`assessPlannedCandidates()` 再与本地计算线索合并，而不是让审核结果整体替换线索。问题匹配始终是模型的语义结论；方法、证据类型和贡献分项在审核提供时使用模型线索，否则使用代码计算的词项线索；明确的偏题结论则不计任何线索。本地表面关键词命中与不确定项始终保留，因此语义审核不会清零确定性词项线索，也不会把词项线索标作已核实证据。

## Alternatives considered

沿用首个 P0/P1/P2 切片保留了现有代码，却让问题覆盖听凭运气。只按评分排序忽略了无摘要候选需要仅凭标题判断。把选择放进 Controller 会重复规则；放在纯库中让规则可测，把传输留给调用方。

## Consequences

模型审核预算独立于 Plan 候选上限和 P0/P1/P2 队列规模，调用方移除两者的 `Math.min` 上限。此前的尝试会跨轮次减少剩余预算。解析与选择函数保持纯粹；Controller 接线、有界并发和版本化 Session 事件仍由 A 负责。

## Verification

`tests/parse-semantic-review.spec.ts` 固定可接受的相关、偏题和未知判断，并固定对额外字段、未批准或重复问题、捏造或来源不可用引文以及自相矛盾范围结论的拒绝。`tests/select-reviews.spec.ts` 固定覆盖优先于补足、预算耗尽、整份预算被此前尝试占用、规范身份破同分，以及批准/排序/评估/预算不一致时的显式失败。`tests/rank.spec.ts` 固定最小审核在可能相关与未知范围下保留代码计算线索、偏题时不计任何线索，并保留本地表面关键词命中。
