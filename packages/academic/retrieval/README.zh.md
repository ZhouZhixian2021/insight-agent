---
description: "规划已审核的学术源、Web 和站点查询，检索已核验候选，并形成可解释的优先级队列。"
kind: "package-library"
---

# @deepseek-ai/dsh-academic-retrieval

[English](README.md) | 中文

## 概述

学术工作流调用方可从已批准的 ResearchBrief 生成按渠道区分的查询、检索已核验成果，并将其排入可解释的 P0/P1/P2 队列。结果保留已核验 Web 发现、摄取决定、查询来源，以及每项候选的过滤和评分理由。本库不注册 Cordis 服务，也不启动研究运行。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 适用场景

Academic Controller 或工作流提供已批准的 Brief、经审核的扩展词、提供方 ID、结果上限与适配器。`planHybridSearch()` 返回供审核的 `HybridSearchPlanningOutput`；`executePlannedSearchRound()` 在批准后只执行指定轮次，并可发布 Web 发现、引用识别和引用核验的实时事实。调用方可用 `preReviewHardExclusions()` 跳过被已批准元数据规则排除的成果的语义审核；`rankPlannedCandidates()` 对每项已核验成果与调用方审核的语义判断复用相同规则及排序策略。`extendPlanForEvidenceGaps()` 根据同一 Brief 版本的覆盖结果添加有数量上限的查询。准确签名见[公开导出](src/index.ts)。

### 元数据初筛

新评估返回必带 `screening` 的 `DetailedCandidateAssessment`。参与计分的问题、方法、证据类型和贡献信号逐字引用规范标题或学术摘要。完整的词项问题及贡献匹配必须在同一个引用来源中成立。关键词只提供 `surfaceKeywordHits`，不增加这些分项。词项范围判断保持 `unknown`；缺少摘要不能证明偏题。排序器拒绝没有对应引文的详细评分；有原文支持且针对当前 Plan 的 `off_topic` 判断触发硬排除。没有 `screening` 的旧评估保持原有解释。

可选的第六个参数 `reviewedScreenings` 是按成果 ID 索引的外部审核详情，用于替代词项线索。`parseCandidateScreening(text, title, abstract, keywords, questions)` 接受符合 `CandidateScreeningDetails` 的完整 JSON，核对逐字引文与批准问题引用，并拒绝额外字段。审核过的方法和证据标签必须对应批准概念的别名；比例统计不同概念，不累计重复信号。语义审核可把英文摘要关联到批准的中文问题，不改变查询路由。调用方负责审核质量；引文证明来源，不证明解释正确。

外部审核指令必须提供准确的 Plan 问题与范围规则、批准线索、规范标题和学术摘要。区分实际研究目标、词语提及与否定表述，引用原文，并在元数据不足时使用 `unknown`。代码生成、图像生成和安全研究是否相关由当前 Plan 判断，不使用全局黑名单。只输出 `schemaVersion: 1`、`signals`、`surfaceKeywordHits`、`uncertainties` 和 `scope`，不输出分数或论文身份。调用方负责模型传输、token 策略及持久请求／结果记录；本库不调用模型。

### 最小语义审核与送审选择

`parseCandidateSemanticReview(text, title, abstract, approvedQuestions)` 接受 `CandidateSemanticReviewRequestV1`／`CandidateSemanticReviewV1` 定义的最小判断：三态 `scope` 以及引文逐字出现在规范标题或学术摘要中的已批准问题匹配。它拒绝额外字段、未批准或重复问题、捏造或来源不可用的引文，以及自相矛盾的范围结论与问题列表。传输失败、超时、截断和无效 JSON 仍属调用方失败，不会变成模型的 `unknown`。

`selectCandidateReviews(brief, plan, ranking, assessments, attemptedWorkIds, maximumModelReviews)` 是确定性的送审前选择器。它先按每篇候选的 `discoveredBy` 路由为已批准问题分配覆盖名额，再按词项初排补足剩余名额，最终以规范论文身份破同分。它为每篇候选给出 `selected`、`not_selected_budget`、`hard_excluded`、`fulltext_unresolvable` 或 `already_attempted`，且查询路由不增加语义匹配分。共享预算跨初轮与缺口轮，独立于 Plan 候选上限和 P0/P1/P2 队列规模。

`screeningFromSemanticReview(review)` 把通过校验的判断投影为初筛记录，`assessPlannedCandidates()` 再与本地计算线索合并：问题匹配始终是模型的语义结论，方法、证据类型和贡献分项在审核未提供时保留代码计算的线索，明确的偏题结论则不计任何线索。本地 `surfaceKeywordHits` 与不确定项保留，因此语义审核不会清零确定性词项线索，也不会把词项线索标作已核实证据。

调用方提供 `CandidateScreeningCriteria` 和每个规范版本的全文解析事实。问题概念应包含研究主题词。主题相关性取主题或单个问题的最高命中比例，因此专门研究某个问题的论文无需匹配所有问题。方法和证据比例各用对应线索；缺失线索记零分。自然语言规则保持 `null`，等待全文验证。`sourceQuality` 衡量书目信息完整度，不代表科学质量。时效性使用 Plan 指定的日期口径及可选的 `asOfYear`/`recencyWindowYears` 配对；已审核发表时间缺少任一边界时同时省略两者。Q5 单独按批准查询推导发现路由，不增加问题匹配分。

```text
const assessments = assessPlannedCandidates(plan, brief, round, reviewedCriteria, fulltextFacts)
const ranking = rankPlannedCandidates(plan, brief, round, assessments)
```

[初筛测试](tests/rank.spec.ts)提供可执行交接样例，包含已审核中英文别名、只匹配一个问题的 P0 论文、无关排除论文，以及明确缺失的元数据。Controller 负责术语审核、全文解析、接入与日志；元数据匹配不代表证据覆盖。

### 入口

向 `planHybridSearch(input, options)` 传入已批准的 `HybridSearchPlanningInput`。有效结果分别包含学术源、Web 和指定站点查询及稳定 ID。批准状态、主机名、上限或问题引用无效时抛出 `RangeError`；可选扩展超过查询上限时返回警告。将审核后的计划、轮次、明确的核验上限、适配器和可选进度观察器交给 `executePlannedSearchRound()`。正式的第 3 版 Controller 路径在已批准轮次和有界证据缺口轮次中都使用该执行器；没有明确检索策略的旧计划继续使用兼容适配器。随后把结果、同一 Brief 和每项已核验成果恰好一份 `CandidateAssessment` 交给 `rankPlannedCandidates()`。结果绑定 Brief 版本，为每项成果保留一份完整评估，并以 `WorkVersionId` 返回有序队列。学术源提供方缺失或取消会使检索拒绝；语义判断不完整会使排序拒绝。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[规划器](src/planner.ts)使用 Brief 别名与已审核扩展词。[执行器](src/execute.ts)核验 Web 引用，只把学术提供方记录交给[摄取库](../ingestion/README.zh.md)。[初筛器](src/assess.ts)从规范标题和摘要生成带引文的线索，或消费外部审核结果；[语义审核解析](src/parse-semantic-review.ts)核对最小模型判断，[初筛合成](src/semantic-screening.ts)将其投影用于合并，[送审选择](src/select-reviews.ts)分配共享的模型审核预算。[排序器](src/rank.ts)校验引文与评分的对应关系，应用硬过滤和批准权重，并生成兼顾多样性的队列。自然语言判断为 `null` 时只保留限制，不作硬排除。调用方负责审核、Session 事件、批次与模型可见内容的渲染。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

[Academic Model](../model/README.zh.md)定义计划与候选记录。[Academic Source](../source/README.zh.md)提供学术源检索与引用核验。[学术洞察子系统](../../../docs/subsystems/academic-insight.zh.md)说明包的所有权。

-----

<a id="model-experience"></a>
## 模型体验

间接影响：工作流消费方负责记录并渲染计划查询与已核验候选；本库自身不提供提示词或工具模式。

#### KV 缓存影响

本库不直接使缓存失效；工作流负责记录模型可见输入。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **不推断语义扩展词** — 调用方提供审核过的同义词与方法名；Brief 别名直接使用。
- **不执行引文 API** — 引文扩展种子保留在共享计划中，等待后续提供方集成。
- **不持久化运行状态** — 调用方在 Session 数据中记录已批准计划、查询结果与摄取输出。
- **词项初筛是初步判断** — 已审核别名必须明确提供；缺失元数据、否定表述和方法声明需要证据审核。全文可用性本身不提高证据潜力分。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>

**运行时不变量：**不发布配套检查。这个纯库没有持久事件流；聚焦测试覆盖批准状态、查询上限、核验、去重、过滤与排序行为。
