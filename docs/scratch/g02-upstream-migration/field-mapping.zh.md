---
description: "核对学术 Session 的精确引用、完整顶层载荷字段及必须保留的值。"
owner: "A"
created: "2026-10-22"
expires: "2026-11-22"
promotion-target: "经核对的迁移规范与包文档"
---

# G02 引用与字段映射

[English](field-mapping.md) | 中文

## 摘要

本参考区分 Session 坐标、业务计数和不透明身份。6 类事件含有 8 个 SessionSeq 位置。T0 与 A 的 19 类顶层字段集合具有相同显示类型和可选标记，但共享的嵌套 Message 类型仍有变化。以下转换规则仅为方案，尚未应用。

## 目录

- [引用位置](#reference-positions)
- [顶层字段](#top-level-fields)
- [保留值](#preserved-values)
- [Dev Note](#dev-note)

## 引用位置
<a id="reference-positions"></a>

写入器保存已持久化请求的 seq；选择分配将其持久化封套 seq 返回给后续评审。可空位置保留 null，缺少必需字段与 null 不同。

| 事件 | Data 字段 | 较早目标 | 可空 |
| --- | --- | --- | --- |
| `academic/candidate-screening-result` | `data.requestSeq` | `academic/candidate-screening-request` | 是 |
| `academic/candidate-semantic-review-request-v1` | `data.selectionSeq` | `academic/candidate-review-selection-v1` | 是 |
| `academic/candidate-semantic-review-result-v1` | `data.selectionSeq` | `academic/candidate-review-selection-v1` | 是 |
| `academic/candidate-semantic-review-result-v1` | `data.requestSeq` | `academic/candidate-semantic-review-request-v1` | 是 |
| `academic/candidate-semantic-review-verified-v1` | `data.requestSeq` | `academic/candidate-semantic-review-request-v1` | 否 |
| `academic/candidate-semantic-review-verified-v1` | `data.selectionSeq` | `academic/candidate-review-selection-v1` | 是 |
| `academic/evidence-result` | `data.requestSeq` | `academic/evidence-request` | 是 |
| `academic/synthesis-result` | `data.requestSeq` | `academic/synthesis-request` | 是 |

每条边需要独立映射：r → M23[r] → M34[M23[r]]。系统消息和中断轮次插入会改变事件数量，映射必须使用实际输出位置。即使数值不变，引用也必须指向已存在的较早同类目标，并匹配已声明的相关身份字段。未知、未来、缺失、错类或不一致引用必须失败，不能删去或改填 null。

## 顶层字段
<a id="top-level-fields"></a>

问号表示可选成员。完整字段类型、嵌套数字路径和源码声明位置见[审计证据](audit-evidence.json)。方案不包含未列出的载荷转换。

| 事件 | 完整顶层 data 字段 | Session 引用成员 |
| --- | --- | --- |
| `academic/background-run-state` | `schemaVersion`, `researchBriefId`, `state`, `startedAt`, `updatedAt`, `retrievalRunId`, `progress`, `q6`, `result`, `error`, `cancelReason`, `sessionId`, `backgroundRunId` | 无 |
| `academic/candidate-batch-decision` | `retrievalRunId`, `batchIndex`, `action`, `workVersionIds`, `searchQuestions`, `reason` | 无 |
| `academic/candidate-batch-settlement` | `retrievalRunId`, `batchIndex`, `admittedEvidence`, `coverage?`, `completedAt` | 无 |
| `academic/candidate-review-selection-v1` | `researchBriefId`, `researchBriefVersion`, `roundIndex`, `selection` | 无 |
| `academic/candidate-screening-request` | `academicWorkId`, `researchBriefId`, `researchBriefVersion`, `phase?`, `fragment?`, `config`, `messages`, `estimatedInputTokens`, `contextWindow`, `outputTokens`, `attempt`, `maxAttempts`, `decision` | 无 |
| `academic/candidate-screening-result` | `academicWorkId`, `researchBriefId`, `researchBriefVersion`, `usage?`, `finish?`, `phase?`, `fragment?`, `attempt`, `maxAttempts`, `status`, `requestSeq`, `elapsedMs?`, `firstContentElapsedMs?`, `failurePhase?`, `stream`, `errorCode?` | `requestSeq` |
| `academic/candidate-semantic-review-request-v1` | `workVersionId`, `roundIndex`, `selectionSeq`, `academicWorkId`, `researchBriefId`, `researchBriefVersion`, `phase?`, `fragment?`, `config`, `messages`, `estimatedInputTokens`, `contextWindow`, `outputTokens`, `attempt`, `maxAttempts`, `decision` | `selectionSeq` |
| `academic/candidate-semantic-review-result-v1` | `workVersionId`, `roundIndex`, `selectionSeq`, `academicWorkId`, `researchBriefId`, `researchBriefVersion`, `usage?`, `finish?`, `phase?`, `fragment?`, `attempt`, `maxAttempts`, `status`, `requestSeq`, `elapsedMs?`, `firstContentElapsedMs?`, `failurePhase?`, `stream`, `errorCode?` | `selectionSeq`, `requestSeq` |
| `academic/candidate-semantic-review-verified-v1` | `requestSeq`, `review`, `workVersionId`, `roundIndex`, `selectionSeq`, `academicWorkId`, `researchBriefId`, `researchBriefVersion` | `requestSeq`, `selectionSeq` |
| `academic/evidence-enhancement-selection` | `schemaVersion`, `retrievalRunId`, `workVersionId`, `selectedAt` | 无 |
| `academic/evidence-enhancement-settlement` | `status`, `completedAt`, `addedEvidenceRecords`, `incompleteFragments`, `schemaVersion`, `retrievalRunId`, `workVersionId`, `selectedAt` | 无 |
| `academic/evidence-fragment-verified` | `source`, `fragment`, `evidence`, `purpose?` | 无 |
| `academic/evidence-request` | `source`, `phase?`, `fragment?`, `config`, `messages`, `estimatedInputTokens`, `contextWindow`, `outputTokens`, `attempt`, `maxAttempts`, `decision` | 无 |
| `academic/evidence-result` | `source`, `phase?`, `fragment?`, `requestSeq`, `attempt`, `maxAttempts`, `status`, `elapsedMs?`, `firstContentElapsedMs?`, `failurePhase?`, `stream`, `finish?`, `usage?`, `errorCode?` | `requestSeq` |
| `academic/recovery-checkpoint` | `schemaVersion`, `retrievalRunId`, `startedAt`, `executedQueries`, `search`, `works`, `versions`, `candidates`, `plan`, `assessments`, `ranking`, `policy`, `rounds`, `decisions`, `settlements`, `coverage`, `papers`, `paperFailures`, `providerFailures`, `availableFulltextWorks`, `selectionTruncated`, `selectionLimitations`, `scheduledWorkVersionIds`, `completedBatchCount`, `consecutiveBatchesWithoutEvidence`, `completedSearchRounds`, `pendingBatchIndex` | 无 |
| `academic/run-settlement` | `retrievalRunId`, `status`, `completedAt` | 无 |
| `academic/search-plan` | `schemaVersion`, `researchBriefId`, `researchBriefVersion`, `maximumSearchRounds`, `queries` | 无 |
| `academic/synthesis-request` | `input`, `phase?`, `fragment?`, `config`, `messages`, `estimatedInputTokens`, `contextWindow`, `outputTokens`, `attempt`, `maxAttempts`, `decision` | 无 |
| `academic/synthesis-result` | `retrievalRunId`, `status`, `rejectedStatements?`, `usage?`, `finish?`, `phase?`, `fragment?`, `attempt`, `maxAttempts`, `requestSeq`, `elapsedMs?`, `firstContentElapsedMs?`, `failurePhase?`, `stream`, `errorCode?` | `requestSeq` |

## 保留值
<a id="preserved-values"></a>

以下区分用于防止批量替换数字破坏证据或授予新的批准依据。

| 值组 | 保留要求 |
| --- | --- |
| Session、Brief、run、work、version、query、evidence、locator、claim、message 和 call 身份 | 保留全部值、嵌套副本和版本。ID 内的 :code: 片段或数字后缀不是 Session 引用。 |
| progress.sequence、q6.sequence、result.q6.sequence | 保留运行内计数。progress.ts 递增自有序号，pipeline.ts 递增观察序号，q6 投影复制该值。 |
| 批次、轮次、尝试次数、评分、预算、时长和 HTTP 状态 | 保留普通数字，包括检查点和后台状态中的全部副本。 |
| 片段、段、问题、草稿和块索引、字符区间、PDF 页码和段落号 | 保留来源局部坐标；不因数字相等或名称包含 index/sequence 就进行重映射。 |
| 模型配置、消息文本、流、证据、报告、诊断和拒绝陈述 | 保留路由、配置、顺序、内容和结论。不应用当前模型默认值，也不重新生成输出。 |
| 提供方 replayState 及其他已声明私有 JSON | 保留 JSON，不将内部数字解释为坐标或批准证据。 |
| 封套 seq、标准 surface 引用、继承切口及限定代际的捕获 | 沿用逐边坐标和切口规则。学术日志事件不能获得 surface 元数据。原代捕获保留原坐标含义。 |

## Dev Note

<details>
<summary>拟议转换规则</summary>

初始范围仅接纳已经审计的 T0 请求和消息变体。泛型 Message[] 声明不能证明所有消息角色或扩展均可安全处理。未知变体需要独立来源审计。

| 历史值 | 拟议处理 |
| --- | --- |
| request.messages[].source 的 plugin 为 dsh-academic-workflow | 中间阶段保留；3→4 仅将已审计 user/text 归属转为 kind academic-workflow。保留 id、role 和 content。 |
| request.messages[].source 的 plugin 为 dsh-api-academic-research-controller | 3→4 将已审计归属转为 kind academic-candidate-review；保留历史 screening 和 semantic 请求正文。 |
| 原生 tool/result 包装及现有 meta | 复用 U0 转换并保留原 meta；只有已经存在的 approved=true 才满足批准要求。 |
| T0 tool/code-dispatch 与额外携带 meta 的格式 2 记录 | 复用标准 PTC 更名并保留配对 ID。T0 不提供 meta；格式 2 的额外 meta 仍按未审计变体拒绝，不删除或补填。 |
| image.offloaded、failure.offloadImages 和 developer 消息等新共享类型 | 不为 T0 数据合成这些字段。未支持的历史角色或内容标签仍明确拒绝。 |

检查点和后台状态分别包含 76 和 186 个普通数字路径，片段验证包含 20 个。这些载荷中未发现额外声明的 SessionSeq。计数描述静态字段路径，不表示观察值数量或导入测试结果。

</details>
