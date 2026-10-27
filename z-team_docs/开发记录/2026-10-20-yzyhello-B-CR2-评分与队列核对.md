# 开发记录：B-CR2 候选评分与队列核对

## 范围与基线

本轮执行候选语义审核优化方案的 B 第 2 步「评分和候选去向核对」：基于 A 的评分交接包逐篇核对分项、送审机会与 P0／P1／P2 去向，并解释 Flash 新增问题匹配对分数和队列的影响。所属目录为 `packages/academic/retrieval/` 与交接包 `z-team_docs/验收数据/2026-10-20-candidate-review/scoring-handoff/`。当前分支 `dev/yzyhello`，基线为已合入 A 交接提交的 `bee2f55440`；交接包记录的生产代码版本为 `b869328e15`。保留批准权重与阈值，未调用模型，未修改源码。

## 重放与逐篇核对

交接包重放入口 `packages/api/academic-research-controller/tests/candidate-review-handoff.spec.ts` 走生产的 `assessPlannedCandidates`／`selectCandidateReviews`／`rankPlannedCandidates`。三项校验通过：Pro 重放、Flash 重放，以及跨模型分数差异归因。重建的词项初排评估、送审决定、审核后完整评估、分项得分与队列顺序均与保存结果逐字段一致。

两轮批准参数相同：主题 30、问题匹配 20、证据潜力 15、方法匹配 10、版本类型 8、来源完整度 7、时效 5、全文可解析 5；P0／P1／P2 阈值 80／65／50；5 个研究问题平分 20 分，每个有效匹配 4 分。

| 论文 | 匹配数 Pro→Flash | 总分 Pro→Flash | 队列（位置）Pro→Flash |
| --- | --- | --- | --- |
| AI Agents vs. Agentic AI | 4→4 | 68.5→68.5 | P1(1)→P1(2) |
| A Review of Prominent Paradigms for LLM-Based Agents | 1→1 | 55.33→55.33 | P2(4)→P2(2) |
| DUMA-Bench | 2→2 | 59.33→59.33 | P2(2)→P2(1) |
| The Rise of Agentic AI | 4→4 | 66→66 | P1(2)→P1(3) |
| Multi-Agent Cooperative Planning and Execution Framework | 3→4 | 62→66 | P2(1)→P1(4) |
| From Storage to Experience | 1→1 | 54→54 | P2(5)→P2(4) |
| Evaluation and Benchmarking of LLM Agents | 1→2 | 54→58 | P2(6)→P2(3) |
| Orchestration and Verification of Agentic AI Systems | 3→5 | 62→70 | P2(3)→P1(1) |

队列计数：Pro P0／P1／P2 = 0／2／6，Flash = 0／4／4；两轮均无排除。分项核对：8 篇的 `topicRelevance`／`evidencePotential`／`methodMatch`／`workTypeFit`／`sourceQuality`／`recency`／`fulltextAvailability` 两轮完全相同，唯一变化是 `questionMatch`，总分变化等于匹配数变化乘 4。`methodMatch`（2.5）与 `evidencePotential`（0）来自代码词项线索回退，不是模型生成；重放确认审核只提供 scope 与问题匹配，方法／证据维度由本地线索补齐。

## 送审名单与问题覆盖

两轮送审名单与顺序相同：覆盖优先选中 `A Review`（路由 Q1、Q2）、`AI Agents`（Q3、Q5）、`Multi-Agent Cooperative`（Q2、Q4），覆盖全部 5 个问题；再按词项初排补足 `DUMA-Bench`、`The Rise`、`From Storage`、`Evaluation`、`Orchestration`。候选去重后共 8 篇，审核预算 8，`attemptedWorkIdsBefore` 为空，8 篇全部 `selected`，没有 `not_selected_budget`／`hard_excluded`／`fulltext_unresolvable`／`already_attempted`。

问题覆盖：Q1–Q5 的 `routedWorkIds` 分别为 4／6／3／2／3，`reviewSelectedWorkIds` 均不小于 1，每个问题都获得送审机会。查询路由只分配名额、不增加语义匹配：例如 `From Storage` 路由 Q1、Q2 但只匹配 Q1，`Orchestration` 路由 Q2、Q4 而 Flash 匹配全部 5 个问题。

## 三篇差异归因

- `Multi-Agent Cooperative`：Flash 新增「落地趋势」匹配 → +4，62→66，P2→P1。
- `Evaluation and Benchmarking`：Flash 新增「安全、可靠性与治理」匹配 → +4，54→58，P2→P2（未跨 65 阈值）。
- `Orchestration and Verification`：Flash 新增「架构与核心能力」和「评测与基准」两条匹配 → +8，62→70，P2→P1。
- 三篇均无删除匹配，其他分项不变；`comparison.json` 将三条标为 `questionJudgmentNeedsIndependentReview`，判定是否准确由 C 独立评测，不从分数推断。

## 结论与限制

- 未发现评估器或排序器缺陷，无需修改所属模块；保留批准权重与阈值。
- P0 为空（两轮最高 70 小于 80）如实保留，未下调阈值或补造信号。`recency` 为 0 因批准发表窗口没有同时提供起止年份，`evidencePotential` 为 0 因批准概念组没有命中可计分线索，均为当次输入与算法结果。
- 本批候选数（8）恰好等于审核预算（8），送审名单等同全体候选，没有出现被替换论文；选择器的覆盖价值体现在送审顺序与理由，未在淘汰路径上体现。完整发现池的送审遗漏评测仍需另行提供材料，不能由本包推断。
- 本批 8 篇范围判断均为 `potentially_relevant`，没有 `off_topic` 论文，故偏题硬排除路径未在本批出现；该路径由既有固定样例固定。
- 未调用模型、未运行检索／全文／证据／报告阶段，未修改源码。

## 验证

- `npx vitest run packages/api/academic-research-controller/tests/candidate-review-handoff.spec.ts`：3/3 通过（Pro 重放、Flash 重放、分数差异归因）。
- `npx vitest run packages/api/academic-research-controller`：12 个文件、180 个用例通过。
- 数据来源：`scoring-handoff/{input,pro,flash,comparison,manifest}.json`，生产代码版本 `b869328e15`。
