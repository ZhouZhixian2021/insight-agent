# 八篇候选语义审核完整评分交接包

[English](README.md) | 中文

## 用途与范围

B 可以用本包原样复算 Pro／Flash 的送审选择、完整候选评估、P0／P1／P2 队列和研究问题匹配，解释模型判断为何改变分数及队列。材料来自 2026-10-20 的同批八篇真实审核，复用批准参数、学术元数据、已验证模型判断及当次评分结果；不需要模型密钥、Web 服务或 A 本机 `.dsh-runtime`。

本包只包含八篇固定复验候选，不能判断原始完整发现池中还有哪些论文被遗漏。`candidateQuestionCoverage` 描述查询路由和标题／摘要的语义问题匹配，没有全文证据 ID，不是证据支持覆盖或研究完成状态。模型输出也不是 C 的人工标准答案。保存的全文事实只证明当次地址解析得到候选 URL，不承诺当前下载或解析成功。

## 文件与字段

| 文件 | 可核对内容 |
| --- | --- |
| [input.json](input.json) | 同版本批准 `brief`、批准查询 `approvedSearches`、概念组 `candidateScreening`、原来源计划 `sourcePlan`、八篇规范论文／版本／摘要／关键词／日期及原查询来源 `records`、冻结全文地址事实 `fulltextResolutions`、审核部署限制。 |
| [pro.json](pro.json) | Pro 运行 Session、模型配置、每篇请求／结果序号与用量、实际送审决定、已验证原文引用、准确的运行 Plan、确定性评估条件、初筛评估和排序、审核后完整 `scheduling.assessments`／`ranking`／批次策略，以及问题匹配汇总。 |
| [flash.json](flash.json) | Flash 的同类完整记录；保留其自身运行查询 ID 与来源映射。 |
| [comparison.json](comparison.json) | 八篇逐一对照的全部分项得分、队列位置、总分增量、增加／减少的问题、需要独立评测的差异。 |
| [manifest.json](manifest.json) | 数据版本、来源代码提交、原会话与两次复验会话、范围限制、四个 JSON 文件的 SHA-256。 |

`records` 保留原始规范论文与版本身份；不得用重新分配 ID 的去重结果替换它们。两次复验重新规划了查询，查询 ID 不同。重放入口根据 `sourcePlan` 中原查询的表达式映射至每个 `scheduling.plan` 的实际查询，并按正式 Controller 的规则去重来源 ID；`queryProvenance` 保存对应的准确映射结果。查询路由只分配送审机会，不增加问题匹配分。

`selectionEvent` 是真实提交的送审事件，保留 `eventSeq`、轮次和完整 `CandidateReviewSelectionV1`；不是依据最终分数倒推的名单。`verifiedReviews` 保留已验证判断、请求序号和事件序号，`requestFacts`／`resultFacts` 可用于串联调用。`initialLexical` 是根据冻结输入、运行 Plan 和现有纯函数重建的模型前评估与排序，不能当作额外一次模型运行；审核后 `scheduling` 则直接导出当次保存的真实结果。重放逐项核对这两类来源。

## 重放方法

已安装仓库依赖后，在仓库根目录执行：

```powershell
pnpm exec vitest run packages/api/academic-research-controller/tests/candidate-review-handoff.spec.ts
```

入口只读取本包并调用现有纯函数，不启动 DSH 应用，不搜索、不获取全文、不调用模型。它从冻结的去重记录恢复原身份，核对文件哈希，重新生成批准评估条件、词项初排与送审决定，校验模型判断的原文引文，再复算完整评估、分项得分、队列顺序和候选问题匹配。预期三个校验通过：Pro 重放、Flash 重放及全部分数差异归因。

若重放失败，先确认使用的代码提交和接口版本，再查看具体论文的评估、来源映射或队列差异。调整评分器或共享协议时应记录决定；不能仅改预期数据让校验通过。未改变生产算法或材料时，不需要重新进行八篇模型调用。

## 本批结果与差异

两轮批准评分参数相同：主题 30、问题匹配 20、证据潜力 15、方法匹配 10、版本类型 8、来源完整度 7、时效 5、全文地址可解析性 5。P0／P1／P2 阈值为 80／65／50。五个研究问题平分 20 分，每增加一个有效匹配增加 4 分。审核预算 8 篇与 Plan 的候选上限 30、最终纳入上限 10 分开保存，不互相替代。

| 模型 | P0 | P1 | P2 | 排除 | 审核耗时 |
| --- | --- | --- | --- | --- | --- |
| Pro | 0 | 2 | 6 | 0 | 273.636 秒 |
| Flash | 0 | 4 | 4 | 0 | 132.316 秒 |

| 论文 | 匹配问题数 Pro → Flash | 总分 Pro → Flash | 队列 Pro → Flash |
| --- | --- | --- | --- |
| Multi-Agent Cooperative Planning and Execution Framework | 3 → 4 | 62 → 66 | P2 → P1 |
| Evaluation and Benchmarking of LLM Agents | 1 → 2 | 54 → 58 | P2 → P2 |
| Orchestration and Verification of Agentic AI Systems | 3 → 5 | 62 → 70 | P2 → P1 |

另外五篇的分项得分相同，队列内位置仍可能随其他论文变化；实际顺序以各运行 `ranking.queues` 为准，排序器还会应用既有多样性规则。本包保留该顺序，不用按总分重新排序的表格冒充正式队列。所有差异仅来自问题匹配分，其他分项不变。

时效分为 0，因为该批准发表窗口没有同时提供起止年份；证据潜力为 0，因为批准概念组没有命中可计分线索。这是当次输入及算法的结果，交接没有补填日期或修改概念组。P0 为空也如实保存，不通过下调阈值或补造信号制造高优先级论文。

## 成员接手

- **B**：先重放，再逐篇核对分项、送审机会和 P0／P1／P2 去向；对三篇新增问题匹配解释评分影响。保留批准权重和阈值，若发现评估／排序缺陷再修复所属模块。
- **C**：核对三篇新增匹配是否被摘要内容和原文引文充分支持，补充独立相关性标注。引文存在不等于问题相关性成立；范围判断均为 `potentially_relevant` 也不等于最终纳入研究。
- **A**：本包补齐八篇评分交接；根据 B/C 发现的问题维护批准参数、模型提示词、调用与 Session 接线。完整发现池的送审遗漏评测和全文证据覆盖评测仍需各自材料，不能从本包推断通过。

详细调用对比见[固定样本复验记录](../../../开发记录/2026-10-20-zhouzhixian2021-候选语义审核固定样本复验.md)，团队执行顺序见[分工方案](../../../模块分工/academic-candidate-semantic-review-optimization-team-plan.md)。
