# 成员 A：Academic Model 实施计划

## 目标与边界

成员 A 负责把已确认的 `academic-model-v1` 设计实现为独立共享包 `packages/academic/model`。该包只定义稳定的学术业务数据类型和纯函数，不负责论文检索、单篇证据抽取、跨论文分析、报告界面或模型调用。

- A 独占维护 `packages/academic/model/**`。
- B 消费本包，实现单篇论文规范化与 EvidenceCard 产出。
- C 消费本包，实现跨论文 Claim、覆盖度和报告结构。
- B、C 发现接口缺失时提供输入样例、期望字段和失败场景，由 A 修改共享模型。

## 实施顺序

1. A1 基础包：不透明 ID、`Availability<T>` 五态类型、纯判定函数、包级文档和聚焦测试。
2. A2 学术成果：`AcademicWork`、`WorkVersion`、外部标识符、作者、日期、来源记录和去重规则。
3. A3 研究简报：范围、时间窗口、证据要求、报告要求、停止条件和人工批准状态。
4. A4 证据卡片：EvidenceCard 六分区、证据定位、抽取状态、质量评估和论文版本快照引用。
5. A5 分析输入：Claim、证据关系、冲突、置信评估、CoverageSummary、批处理结果和失败分类。
6. A6 持久化：解析校验、Schema 版本、相邻迁移、会话事件和必要的 SDK、快照更新。

## 并行协作

A1 合并后，B、C 可以建立各自目录并依赖基础类型。A 开发 A2、A3 时，B 准备提供方样例与适配测试，C 准备跨论文输入样例。A4 合并后 B 正式输出 EvidenceCard；A5 合并后 C 正式输出 Claim 和报告输入。

## 当前进度

截至 2026-09-21，按现有共享包和工作流核对如下。A 暂代 B、C 推进开发与验收，模块归属仍按[模块分工](academic-module-ownership.md)维护。

| 步骤 | 状态 | 已实现内容与剩余边界 |
|---|---|---|
| A1 基础包 | 已完成并被下游使用 | 独立包、品牌 ID、`Availability<T>` 五态及纯函数。 |
| A2 学术成果 | 已完成并被下游使用 | Work、Version、外部标识符与去重规则；跨运行身份索引恢复仍属 A6。 |
| A3 研究简报 | 已完成并被下游使用 | 研究范围、证据和报告要求、停止条件、批准判定；批准后的 Brief 修订机制仍待完善。 |
| A4 证据卡片 | 已完成并被下游使用 | 证据、定位、卡片和快照类型；实际全文及证据链已接入。 |
| A5 分析输入 | 已完成并被下游使用 | 失败与覆盖统计、RetrievalRun、Claim 及证据关系、核验类型与过期检查，已用于真实 Remote 和草稿报告。 |
| A6 持久化与恢复 | 部分实现，未完成 | 模型请求与结果已进入 Session 持久记录；完整证据、运行、报告身份及跨重启恢复仍待设计与实现。 |

实际工作流已接通；A1—A5 的完成不代表 A6 或正式报告验收通过。当前集成步骤见[调用与交接计划](member-a-academic-workflow-call-plan.md)，整体里程碑见[交付计划](../../docs/academic-insight-plan.zh.md)。

## A5 字段清单

本清单保留 A5 实施时的字段约定，不是未完成任务清单；实际导出以[共享包](../../packages/academic/model/README.zh.md)为准。字段解释见[字段规范](academic-model-v1-field-reference.md)，输入需求来自[C 的需求说明](academic-analysis-interface-requirements.md)，交接数据见[固定样例](../interface-samples/academic-model-v1/README.zh.md)。

### 复用输入与标识

- 复用 ResearchBrief、AcademicWork、WorkVersion、EvidenceRecord、SourceLocator、EvidenceCard、EvidenceSnapshot 和 Availability，不重新定义 B 的输出。
- 复用已有 ClaimId、FailureId；补齐对应创建函数。
- 新增品牌 ID：RetrievalRunId、ClaimEvidenceLinkId、ClaimAssessmentId 及创建函数。
- 下表中的对象携带 schemaVersion: 1；枚举、ID 与纯核验结果不另带持久化版本。

### 运行、覆盖与失败

| 对象 | 字段与第一版类型 |
|---|---|
| RetrievalRun | retrievalRunId: RetrievalRunId；researchBriefId: ResearchBriefId；researchBriefVersion: number；stage: ResearchStage；status: BatchStatus 或 null；startedAt: UTC 字符串；completedAt: UTC 字符串或 null；queries: readonly string[]；providers: readonly string[]；academicWorkIds: readonly AcademicWorkId[]；coverageSummary: CoverageSummary；failures: readonly ProviderFailure[]。 |
| CoverageSummary | discoveredRecords、deduplicatedWorks、includedWorks、availableFulltextWorks、abstractOnlyWorks、metadataOnlyWorks、failedOperations: 非负整数；truncated: boolean；limitations: readonly string[]；providerBreakdown: null。 |
| ProviderFailure | failureId: FailureId；provider、operation、message: string；category: FailureCategory；retryable: boolean；retryAfter: UTC 字符串或 null；affectedWorkVersionId?: WorkVersionId。 |
| BatchResult<T> | status: BatchStatus；items: readonly T[]；failures: readonly ProviderFailure[]。 |

ResearchStage 为 planning、awaiting_approval、running、completed、failed、cancelled。BatchStatus 为 success、partial_success、failed；空结果与失败的判断遵循字段规范第 10 节，不能只看 items 数量。FailureCategory 为 invalid_request、authentication_failed、rate_limited、timeout、network_error、upstream_error、not_found、parse_failed、fulltext_unavailable、unknown。operation 保持可扩展字符串，不在共享包实现 Provider 重试。

### 结论、证据关系与评估

| 对象 | 字段与第一版类型 |
|---|---|
| ClaimRecord | claimId: ClaimId；text: string；category: ClaimCategory；scope: string；uncertainty: string 或 null；confidence: ClaimConfidence；confidenceReasons: 非空只读字符串数组；evidenceSnapshot: EvidenceSnapshot；validity: current 或 stale。 |
| ClaimEvidenceLink | claimEvidenceLinkId: ClaimEvidenceLinkId；claimId: ClaimId；evidenceId: EvidenceId；relation: supports、contradicts 或 background；rationale: string。 |
| ClaimAssessment | claimAssessmentId: ClaimAssessmentId；claimId: ClaimId；status: supported、partially_supported、contradicted、unsupported 或 insufficient；reason、method、methodVersion: string；assessedEvidenceIds: readonly EvidenceId[]；assessedAt: UTC 字符串。 |

ClaimCategory 为 consensus、trend、comparison、disagreement、research_gap、limitation。ClaimConfidence 为 high、medium、low、insufficient，不是数值概率。冲突通过 disagreement 与 contradicts 表达，不另建 Conflict 对象。scope 使用样例已经采用的字符串，复杂结构需另有消费需求。

### 必要的纯判断与验收

A5 提供批处理状态判断和 Claim 使用前核验的纯函数，批处理构造使用 createBatchResult，核验使用 checkClaimFreshness。核验输入为 Claim、当前 Brief ID/版本和以 EvidenceId 为键的当前 EvidenceRecord 映射；输出区分 current、stale、unverifiable 并附原因，规则见字段规范第 11.4 节。不把核验通过命名为最终报告获准发布，也不原地修改历史 Claim。

聚焦验收场景：

1. 正常零结果为 success；成功项与错误并存为 partial_success；只有错误为 failed。
2. 截断时必须说明覆盖限制，统计来自真实运行；providerBreakdown 为 null 不补零。
3. Claim 关联的证据与快照引用一致；背景关系不能被计作支持，语义评测由 C 负责。
4. 版本或哈希变化得到 stale；证据或哈希缺失得到 unverifiable；版本和哈希全部一致才通过当前性核验。
5. A1–A4 固定样例保持可消费，B 成功结果在部分失败时不被清空。

### 实现顺序和协作边界

1. 先实现 ID、失败分类、BatchResult、CoverageSummary、RetrievalRun 和 ResearchStage 的共享表示。
2. 再实现 ClaimRecord、ClaimEvidenceLink、ClaimAssessment 和必要的纯判断函数。
3. 补齐聚焦测试、公开 JSDoc、包级双语文档与固定样例验证，再提交 PR。

C 可以依据清单准备分析和评测样例，正式导入类型待 A5 合并。A5 不实现 C 的分析算法、B 的网络或抽取逻辑、真实模型适配、工作流执行、数据库、Session 事件、SDK 迁移或报告页面。RetrievalRun 在本阶段只定义数据结构，持久化及实际阶段流转属于后续工作。
