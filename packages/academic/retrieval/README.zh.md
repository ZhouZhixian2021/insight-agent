---
description: "从已批准的 ResearchBrief 规划学术源、Web 和站点查询，并返回带查询来源关系的已核验、去重论文候选。"
kind: "package-library"
---

# @deepseek-ai/dsh-academic-retrieval

[English](README.md) | 中文

## 概述

学术工作流调用方可从已批准的 ResearchBrief 生成按渠道区分的查询，并通过自己的 Academic Source 与 Web 适配器执行已批准的一轮。结果包含提供方规范化的成果、已核验的 Web 发现、摄取决定，以及发现每项成果的查询 ID。本库不注册 Cordis 服务，也不启动研究运行。

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

Academic Controller 或工作流提供已批准的 Brief、经审核的扩展词、提供方 ID、结果上限与适配器。`planHybridSearch()` 返回供审核的 `HybridSearchPlanningOutput`；`executePlannedSearchRound()` 在批准后只执行指定轮次。`extendPlanForEvidenceGaps()` 根据同一 Brief 版本的覆盖结果添加有数量上限的查询。准确签名见[公开导出](src/index.ts)。

### 入口

向 `planHybridSearch(input, options)` 传入已批准的 `HybridSearchPlanningInput`。有效结果分别包含学术源、Web 和指定站点查询及稳定 ID。批准状态、主机名、上限或问题引用无效时抛出 `RangeError`；可选扩展超过查询上限时返回警告。将审核后的计划、轮次、明确的核验上限与适配器交给 `executePlannedSearchRound()`。配置的学术源提供方缺失或调用方取消时，执行会拒绝；预期的 Web 与引用核验失败会与成功的同级结果一起保留在逐查询结果中。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[规划器](src/planner.ts)使用 Brief 别名与调用方审核过的同义词或方法名，不从自然语言规则中推断术语。[执行器](src/execute.ts)按查询指定的渠道检索、识别 Web 引用、经批准的学术提供方核验，并只把提供方记录交给[摄取库](../ingestion/README.zh.md)。摄取库按精确标识符合并成果和版本，同时保留查询 ID 与已核验发现 URL。调用方负责计划审核、Session 事件、批次、排序及模型可见内容的渲染。

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

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>

**运行时不变量：**不发布配套检查。这个纯库没有持久事件流；聚焦测试覆盖批准状态、查询上限、核验与去重行为。
