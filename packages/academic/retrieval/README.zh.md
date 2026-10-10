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

Academic Controller 或工作流提供已批准的 Brief、经审核的扩展词、提供方 ID、结果上限与适配器。`planHybridSearch()` 返回供审核的 `HybridSearchPlanningOutput`；`executePlannedSearchRound()` 在批准后只执行指定轮次，并可发布 Web 发现、引用识别和引用核验的实时事实。`rankPlannedCandidates()` 对已核验成果与调用方审核的语义判断应用批准的硬过滤和排序策略。`extendPlanForEvidenceGaps()` 根据同一 Brief 版本的覆盖结果添加有数量上限的查询。准确签名见[公开导出](src/index.ts)。

### 元数据初筛

`assessPlannedCandidates(plan, brief, round, criteria, fulltextFacts)` 从规范版本的学术摘要、关键词和标题生成判断。调用方提供 `CandidateScreeningCriteria`，并为每个规范 `WorkVersionId` 提供全文解析事实。每个概念是一组已审核别名；各概念独立匹配。研究问题可由完整的词项概念命中建立路由；当候选的元数据已经命中主题时，也可由已批准查询与研究问题的精确关联建立路由。这个来源回退让中文研究问题继续关联由审核过的英文查询发现的论文，但不增加语义分数，也不证明证据支持。问题词项应包含研究主题词。主题相关性取主题或单个问题的最高概念命中比例，因此专门研究某个问题的论文无需匹配所有问题。方法和证据比例各自使用对应线索；缺失线索记零分。贡献类型只是词项提示，自然语言规则保持 `null`，等待证据验证。`sourceQuality` 衡量作者、发表场所、日期、标识符、摘要及关键词的可用性，不代表科学质量。时效性使用计划指定的日期口径，以及可选的 `asOfYear`/`recencyWindowYears` 配对。已审核发表时间缺少任一边界时应同时省略两者，时效分记零，不虚构参考时段。

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

[规划器](src/planner.ts)使用 Brief 别名与已审核扩展词。[执行器](src/execute.ts)核验 Web 引用，只把学术提供方记录交给[摄取库](../ingestion/README.zh.md)。[初筛器](src/assess.ts)只根据保留的元数据计算分数；已命中主题的候选可使用已批准查询与问题的精确关联作为问题路由回退。[排序器](src/rank.ts)应用硬过滤、按计划策略加权判断比例，并生成兼顾多样性的优先级队列。自然语言判断为 `null` 时只保留限制，不作硬排除。调用方负责审核、Session 事件、批次与模型可见内容的渲染。

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
