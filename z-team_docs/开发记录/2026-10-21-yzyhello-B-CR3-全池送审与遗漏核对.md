# 开发记录：B-CR3 全池送审与遗漏核对

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-21 |
| 负责人 | yzyhello（B） |
| 协作人员 | zhouzhixian2021（A）、ykxy11（C） |
| 个人分支 | `dev/yzyhello` |
| 任务分支 | 无 |
| 提交 | 本记录提交：`docs(academic): 记录 B 全池送审与遗漏核对` |
| 远程状态 | 本地未推送 |

## 范围与基线

本轮执行[候选语义审核减负方案](../模块分工/academic-candidate-semantic-review-optimization-team-plan.md)中 B 的剩余任务，对应团队方案固定验收第 3 项：用 2026-10-19 同一批准 Plan 和固定候选池逐篇核对送审名单、未送审原因与研究问题覆盖，并比较旧版前 8 篇与当前名单。材料为 A 的[完整保留候选池交接](../验收数据/2026-10-20-candidate-review/full-pool-handoff/README.zh.md)，已随 PR #105 合入 `master`；工作分支基线为 `af70b46e49`。保留已批准权重与阈值，未调用模型、未运行检索／全文／证据／报告，未修改源码。

## 材料与重放

[重放入口](../验收数据/2026-10-20-candidate-review/full-pool-handoff/README.zh.md)走生产的 `assessPlannedCandidates`／`rankPlannedCandidates`／`selectCandidateReviews`，只读共享文件。三个校验通过：规范身份／元数据及与八篇包关联，全部评估／队列／选择决定重放，以及实际历史派发与离线名单对照。全池 276 篇去重论文、286 个版本，身份、`metadata` 与全文可用事实逐篇还原，与八篇评分包一致。

## 全池逐篇送审去向

| 去向 | 数量 | 说明 |
| --- | --- | --- |
| `selected` | 8 | 送审预算内选中 |
| `not_selected_budget` | 215 | 硬筛选与地址均合格，预算未轮到 |
| `hard_excluded` | 30 | 原因全部为 `before_publication_window` |
| `fulltext_unresolvable` | 23 | 全文地址不可解析 |

逐篇原因由 `status` 与 `lexical.hardFilter.reasons` 编码；未送审的合格候选只表示预算未轮到，不是模型否定结论。硬排除最高分 48.83，地址不可解析最高分 47.50，均低于 P2 阈值 50，因此本轮硬过滤与地址解析**没有丢弃任何会改变入选集的论文**。

研究问题覆盖：五个批准问题均获得送审机会，选中篇数为 4／6／3／2／3；路由只分配送审名额，不增加语义匹配分。逐篇路由问题数分布为 2 个问题 256 篇、3 个 4 篇、4 个 14 篇、5 个 2 篇。

## 送审名单与旧新对比

| 顺序 | 分数 | 队列 | 选中理由 | 论文 |
| --- | --- | --- | --- | --- |
| 0 | 51.33 | P2 | `question_coverage` | A Review of Prominent Paradigms for LLM-Based Agents: Tool Use (Including RAG), Planning, and Feedback Learning |
| 1 | 52.50 | P2 | `question_coverage` | AI Agents vs. Agentic AI: A Conceptual Taxonomy, Applications and Challenges |
| 2 | 50.00 | P2 | `question_coverage` | Multi-Agent Cooperative Planning and Execution Framework for Distributed LLM Reasoning Systems |
| 3 | 51.33 | P2 | `lexical_fill` | DUMA-Bench: A Dual-Control Multi-Agent Benchmark for Evaluating LLM Agent Security |
| 4 | 50.00 | P2 | `lexical_fill` | The Rise of Agentic AI: A Review of Definitions, Frameworks, Architectures, Applications, Evaluation Metrics, and Challenges |
| 5 | 50.00 | P2 | `lexical_fill` | From Storage to Experience: A Survey on the Evolution of LLM Agent Memory Mechanisms |
| 6 | 50.00 | P2 | `lexical_fill` | Evaluation and Benchmarking of LLM Agents: A Survey |
| 7 | 50.00 | P2 | `lexical_fill` | Orchestration and Verification of Agentic AI Systems: A Survey of Multi-Agent Collaboration and Safety |

当前离线名单与历史实际派发的八篇**成员完全相同、顺序不同**（前两篇与第三、四篇序对调）。**没有被替换掉的相关论文**，因此不能宣称本池相关性覆盖因选择器改善而提高；覆盖价值只体现在送审顺序与理由。历史实际派发为八个旧请求、三篇有效／五篇失败，与原会话没有版本化选择事件一致，也区别于 2026-10-20 的 Pro／Flash 8/8 复验。

队列计数：历史 P0／P1／P2 = 0／1／13，离线重建 = 0／0／14。唯一差异是 `Evaluation and Benchmarking` 由历史 P1（65.50）降到离线 P2（50.00）。离线无 P0、无 P1 如实保留，未下调阈值或补造信号。

## 分数归因

recorded（历史模型判断）与 lexical（离线无模型）仅三篇不同，其余 273 篇逐字段一致：

| 论文 | recorded → lexical | 队列变化 |
| --- | --- | --- |
| Evaluation and Benchmarking of LLM Agents | 65.50 → 50.00 | P1 → P2 |
| Orchestration and Verification of Agentic AI Systems | 64.50 → 50.00 | P2 → P2 |
| A Review of Prominent Paradigms for LLM-Based Agents | 60.33 → 51.33 | P2 → P2 |

差异收敛在问题匹配分量，与"三篇新增问题匹配改变分数"的口径一致。但八篇评分包记录的三篇 Pro／Flash 差异集为 `Multi-Agent Cooperative`／`Evaluation`／`Orchestration`，与此处只重合两篇；两处基线（模型判断 vs 离线无模型）不同，需按[八篇逐篇对照](../验收数据/2026-10-20-candidate-review/scoring-handoff/comparison.json)逐项对齐后确认，不在本记录下结论。

## 预算边界与疑似重复

- **50.00 平局墙**：恰好 50.00 的共 11 篇，选中 5、预算淘汰 6。被淘汰的均为 P2、地址可解析、命中 2 个问题：`Privacy-R1`、`Towards trustworthy agentic AI`、`Reflective memory architecture`、`DataSciBench`、`Information Security, Ethics, and Integrity in LLM Agent Interaction`、`From Language Models to Agentic AI`。平局处完全由路由覆盖与既有排序规则决定，不由分数决定；这不是算法缺陷，但相关性取舍须交 C 独立标注。
- **紧邻边界**：48.83 分组（如 `Understanding the planning of LLM agents`、`LLM Agent Memory` 等）与入选仅差 1.17 分，同样属相关性判断范围。
- **疑似重复 6 组**：`From Storage to Experience` 有 4 条记录（1 条 50.00 入选、3 条 48.83 未选）；`AI Agents vs. Agentic AI` 有 2 条（47.50 地址不可解析未选、52.50 可解析入选）；`LLM Agent Memory`、`R-Judge`、`LLM-Based Human-Agent Collaboration`、`Agentic CLEAR` 各 2 条。去重按 work 保留，倾向版本／来源差异而非代码缺陷，但不排除该合并未合并，列为"可能遗漏"候选。

## 结论与限制

- 全池送审与队列决策复算无异常，无 strictly 高于入选分的论文被跳过；未确认算法缺陷，本轮不改所属纯函数，保留批准权重与阈值。
- 预算跳过与地址不可解析不等于模型否定或语义偏题；P0 为空、离线 P1 为空为当次输入与算法结果。
- 相关性与遗漏的最终判定属 C 的独立标注，本记录不宣称遗漏检查、报告覆盖或端到端质量通过。
- 完整范围为原会话保留的去重池，不含 463 条原始响应明细与十个非规范版本元数据，不能由本包推断全文献遗漏。

## 交给 C 的清单

1. 50.00 平局处被预算淘汰的 6 篇，结合批准问题与可信摘要判断是否应替换任一入选篇。
2. 48.83 紧邻分组的 `Understanding the planning of LLM agents`、`LLM Agent Memory` 等，判断是否漏选。
3. 6 组疑似重复／多版本，确认是否存在该合并未合并，以及以哪条记录为规范身份。
4. 三篇模型分歧（`Multi-Agent Cooperative`／`Evaluation`／`Orchestration`）的独立质量标注，重点核对新增问题匹配是否有摘要与原文引文支持。

## 实际检查

- `pnpm exec vitest run packages/api/academic-research-controller/tests/candidate-pool-handoff.spec.ts`：**3/3 通过**（身份／元数据与八篇关联、全池评估／队列／选择重放、历史派发与离线对账）。
- 只读统计脚本核对 `audit.json`／`replay.json`／`historical.json`：去向计数、队列计数、分数归因、平局分组、重复组、路由覆盖，与 spec 断言一致；脚本为临时分析，未入库。
- 本记录引用的本地链接均指向已合入 `master` 的交接材料与团队方案。
- 未运行整轮真实研究或模型调用，未运行全仓库行为测试。

## 下一步

- C 按上述清单完成独立质量与遗漏标注；B 在 C 给出具体论文／问题／字段后，仅当确认缺陷才修复所属纯解析／选择／排序函数，并重放现有材料，不追加泛化冒烟测试。
- A 按 B／C 具体反馈处理提示词、调用、预算、Session 与接线，随后组织一次完整真实研究验收。
