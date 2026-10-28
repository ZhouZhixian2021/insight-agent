---
description: "查阅 T0 学术事件声明、写入和消费位置及冻结录制覆盖限制。"
owner: "A"
created: "2026-10-22"
expires: "2026-11-22"
promotion-target: "经核对的迁移规范与包文档"
---

# G02 学术事件清单

[English](event-audit.md) | 中文

## 摘要

本参考列出审计的 T0 与 A 源码中全部 19 类学术事件。U0 没有学术事件声明。其中 17 类具有 T0 当前写入点，2 类筛选事件保留历史声明并可追溯到更早写入器。该清单不证明历史导入已受支持。

## 目录

- [事件清单](#inventory)
- [录制覆盖](#recording-coverage)
- [审计限制](#audit-limits)
- [Dev Note](#dev-note)

## 事件清单
<a id="inventory"></a>

这些事件属于必需日志事件。已定位写入器使用普通 Session append 调用，没有将事件标记为可忽略。[审计证据](audit-evidence.json)记录两个源码快照的声明和写入行号。

| 事件 | 载荷 | 写入器 | 消费或关系 | 录制次数 |
| --- | --- | --- | --- | ---: |
| `academic/background-run-state` | `AcademicBackgroundRunView` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | 后台重放保留每个运行的最后视图 | 0 |
| `academic/candidate-batch-decision` | `AcademicBatchDecisionEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | 恢复计划、批次、检查点或终态事实 | 0 |
| `academic/candidate-batch-settlement` | `AcademicBatchSettlementEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | 恢复计划、批次、检查点或终态事实 | 0 |
| `academic/candidate-review-selection-v1` | `ReviewSelectionEvent` | [candidate-review-model.ts](../../../packages/api/academic-research-controller/src/candidate-review-model.ts) | 选择与请求身份绑定后续日志记录 | 0 |
| `academic/candidate-screening-request` | `CandidateReviewModelRequest` | [历史写入器](historical-writers.json) | 已退役写入器；通用历史保留两类事件 | 0 |
| `academic/candidate-screening-result` | `CandidateReviewModelResult` | [历史写入器](historical-writers.json) | 已退役写入器；通用历史保留两类事件 | 0 |
| `academic/candidate-semantic-review-request-v1` | `SemanticReviewRequest` | [candidate-review-model.ts](../../../packages/api/academic-research-controller/src/candidate-review-model.ts) | 选择与请求身份绑定后续日志记录 | 0 |
| `academic/candidate-semantic-review-result-v1` | `SemanticReviewResult` | [candidate-review-model.ts](../../../packages/api/academic-research-controller/src/candidate-review-model.ts) | 选择与请求身份绑定后续日志记录 | 0 |
| `academic/candidate-semantic-review-verified-v1` | `VerifiedSemanticReview` | [candidate-review-model.ts](../../../packages/api/academic-research-controller/src/candidate-review-model.ts) | 选择与请求身份绑定后续日志记录 | 0 |
| `academic/evidence-enhancement-selection` | `AcademicEvidenceEnhancementSelectionEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | Controller 选择限制及 UI 增强区间 | 0 |
| `academic/evidence-enhancement-settlement` | `AcademicEvidenceEnhancementSettlementEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | Controller 选择限制及 UI 增强区间 | 0 |
| `academic/evidence-fragment-verified` | `EvidenceFragmentVerifiedRecord` | [fragment-model.ts](../../../packages/academic/workflow/src/fragment-model.ts) | 已验证片段；增强历史读取选定区间 | 0 |
| `academic/evidence-request` | `EvidenceModelRequest` | [model.ts](../../../packages/academic/workflow/src/model.ts) / [fragment-model.ts](../../../packages/academic/workflow/src/fragment-model.ts) | 已记录请求及模型尝试结算 | 4 |
| `academic/evidence-result` | `EvidenceModelResult` | [model.ts](../../../packages/academic/workflow/src/model.ts) / [fragment-model.ts](../../../packages/academic/workflow/src/fragment-model.ts) | 已记录请求及模型尝试结算 | 4 |
| `academic/recovery-checkpoint` | `AcademicResearchRecoveryCheckpoint` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | 恢复计划、批次、检查点或终态事实 | 0 |
| `academic/run-settlement` | `AcademicRunSettlementEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | 恢复计划、批次、检查点或终态事实 | 0 |
| `academic/search-plan` | `AcademicSearchPlanEvent` | [index.ts](../../../packages/api/academic-research-controller/src/index.ts) | 恢复计划、批次、检查点或终态事实 | 0 |
| `academic/synthesis-request` | `SynthesisModelRequest` | [synthesis-model.ts](../../../packages/academic/workflow/src/synthesis-model.ts) | 已记录请求及模型尝试结算 | 4 |
| `academic/synthesis-result` | `SynthesisModelResult` | [synthesis-model.ts](../../../packages/academic/workflow/src/synthesis-model.ts) | 已记录请求及模型尝试结算 | 4 |

恢复消费位于 [recovery.ts](../../../packages/academic/workflow/src/recovery.ts)，后台重放位于 [background-run.ts](../../../packages/api/academic-research-controller/src/background-run.ts)，增强投影位于 [enhancement-history.ts](../../../packages/client/ui-academic-research/src/client/enhancement-history.ts)。search-plan 通过时间顺序关联：相关运行首个事件之前的最后一个计划。迁移不得给该事件补造 retrievalRunId。

## 录制覆盖
<a id="recording-coverage"></a>

9 份冻结学术 Session v2 录制共包含 16 个必需学术事件。只有 academic-evidence 和 academic-limited-draft 含这些事件，各 8 个。两份录制合计各有 4 个 evidence request/result 和 synthesis request/result。其余 15 类事件没有冻结 Session 事件覆盖。

每份录制中，结果位置 4、6、8、10 分别引用请求位置 3、5、7、9。这些位置按归一化正文序号解释，不表示冻结行包含物理 seq/time 字段。录制包含身份模板并省略这些字段。现有 llm-replay 的 parseSessionLog 测试入口负责物化投影行；生产 codec 的原始输入要求不同。

## 审计限制
<a id="audit-limits"></a>

静态分析仅追踪 src 中的嵌套载荷字段，在 6 类事件中定位到 8 个 SessionSeq 位置。检查点和后台完整状态没有额外声明的 SessionSeq。泛型 Message 与流中的私有 JSON 可以包含提供方不透明数据；审计不重新解释这些数据内的数字。

T0 的 PTC 声明和写入器不保存 meta。冻结录制中 4 次计划评审结果缺少明确批准元数据。历史调用成功不能证明已批准。导入、批准依据和可恢复性分别需要证据。

## Dev Note

<details>
<summary>核对状态</summary>

[字段映射](field-mapping.zh.md)与[方案](minimal-plan.zh.md)尚未实施。本审计不报告录制回放或实际 Session 导入通过。

</details>
