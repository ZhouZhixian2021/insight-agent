# Academic Trace v1 接口交接（C-T0）

## 状态与交付范围

这是供 A/B 核对的接口提案，不是已经注册的 Remote API。基于团队提交 `f55934cb17` 核对现有源码；本次交付字段、固定数据、查询约定、来源映射和可执行样例校验，不创建生产采集器、持久化格式或页面。任务归属见[双路线分工](academic-upstream-upgrade-dual-route-team-plan.md#trace-接口约定与跨版本职责)。A/B 应先反馈新版可采集性，C 再实现 C-T1；HTML 报告可以独立推进。

固定资料位于 [Trace v1 样例目录](../interface-samples/academic-trace-v1/README.md)。全部数据为合成调试事实，不能用作研究证据或性能基准。样例中的 `fixture` 适配器不表示现有日志已经具备所有关联字段。

## 身份与必需字段

以下 JSON 字段除明确可空者外均必填，不以省略字段表达未知。数组无记录用 `[]`，不确定或不适用的可空值用 `null`；影响诊断的身份或历史观测缺失登记 `gaps`，计时未知直接由 `basis: unknown` 表达，不必逐项重复说明。不适用字段（例如阶段节点的模型名）可空而无需缺口。TypeScript 实现沿用已有 `SessionId`、`RetrievalRunId`、`AcademicWorkId`、`WorkVersionId`；Trace、Span、Event 身份使用各自品牌 ID，JSON 中序列化为字符串。

| 对象 | 字段 | 含义 |
| --- | --- | --- |
| Trace | `schemaVersion` | 整数 `1`；仅指本协议，不是 Session 版本。 |
| Trace | `traceId`, `sessionId`, `researchRunId` | 稳定调试链、所属会话、现有 `retrievalRunId`。同一会话多次运行必须隔离。 |
| Trace | `backgroundRunId` | 可空，现有后台任务 ID；与 `researchRunId` 不互换。恢复同一检索运行沿用 Trace，新的后台任务仅是运行关联信息。 |
| Trace | `producer` | `{adapterId, adapterVersion, baseCommit}`，三个字符串均必填；样例用 `baseCommit: "synthetic"`。 |
| Trace | `gaps` | 数据不足列表，每项 `{code, field, message}`；`field` 是相对对象的字段路径，说明为净化后的固定文案。 |
| Trace | `events` | 按稳定顺序排列的观察记录，格式见下文。 |
| Event | `eventId`, `sequence`, `kind` | 稳定 ID、Trace 内非负安全整数顺序、`span_snapshot`。每条记录携带完整 Span 快照，不是增量补丁。 |
| Event | `observedAt` | 可空 ISO UTC 时间；不作为排序或去重键。 |
| Event | `sourceRef` | `{recordId, recordType}`，可空。由适配器产生可回查的稳定引用，不暴露磁盘路径或原始数据。 |
| Event | `span` | 此次观察后的完整 Span。 |
| Span | `spanId`, `parentSpanId`, `kind` | 自身、可空父 ID；种类 `run / stage / paper / call / attempt`。 |
| Span | `stage`, `operation` | 阶段可空：`retrieval / screening / fulltext / extraction / analysis / report`；操作枚举见下一节。 |
| Span | `academicWorkId`, `workVersionId` | 可空，论文及实际版本身份，不用标题或 URL 替代；版本已知但论文身份不可核对时记录缺口。 |
| Span | `providerId`, `model`, `toolName` | 可空字符串，只记录实际观测且允许展示的标识，不读取当前默认配置补历史。 |
| Span | `attemptIndex` | 仅 attempt 为从 1 开始的正整数，其余为 `null`；父节点必须是同一逻辑 call。外层片段重试与内层模型重试不得混算。 |
| Span | `status`, `businessStatus` | Trace 状态及可空原业务状态；二者不能互相冒充。 |
| Span | `startedAt`, `endedAt`, `timing` | 起止时间可空；计时对象见下文。 |
| Span | `failure`, `gaps` | 错误可空，缺口为列表；历史错误保留在原 attempt 上。 |

Trace ID 应由运行身份与协议命名空间稳定生成；重建投影不能更换 ID。事件 ID 来自稳定来源记录身份加记录内子项键，同一记录重放得到同一 ID。适配器负责持久、可重建的顺序映射，不用接收时间随机编号。未知父项用 `parentSpanId: null` 加 `parent_unknown`，不能伪造父调用。根 run 的空父项不是缺失。

尚未得到 `retrievalRunId` 的后台任务仍由现有后台接口展示；本提案查询返回 `not_ready`，不临时把后台 ID 填进研究 ID。历史请求无法证明属于某一运行时不纳入该运行的调用计数，返回 `run_link_missing` 缺口和排除记录数。此限制需 A/B 确认，不能按时间相近或相同 Brief 自动归属。

## 枚举、结算与耗时

`operation` 首版为 `research / stage / paper_processing / academic_search / web_discovery / reference_verification / candidate_review / fulltext_fetch / fulltext_parse / scope_review / evidence_extract / evidence_validate / synthesis / report_render / tool_call / unknown`。未知原始操作保留净化的来源类型与 `operation_unknown`，不从自然语言标题猜测。新增枚举按协议修订协商，消费者拒绝不支持的版本或枚举，不默认为成功。

`status` 为 `queued / running / retry_wait / succeeded / partial_success / failed / cancelled / skipped / unknown`。只有明确结算事实才能进入终态。`validated` 映射为调用 `succeeded`，只表示结构校验通过；`partially_validated` 和阶段 `partial_success` 映射为 `partial_success`；不能提升为人工语义审核通过。输入上限拒绝的 `skipped` 保持跳过，不能计为已发起的网络调用。后台 `completed` 只表示后台执行结束，研究是否部分成功由业务结果展示，不推断所有子项成功。

历史 `pending` 不证明已经排队，映射 `unknown` 并保留业务值；只有明确等待事实才用 `queued`。`not_run` 映射 `skipped`。未观测到 retry 调度时，即使下一次请求存在，也不补造精确等待时间。重启后未结算的节点保留最后状态及 `interrupted_observation`，不自动改为成功、失败或取消。新 attempt 不覆盖旧 attempt 的失败。

`timing` 必填 `queueMs / executionMs / totalMs` 三项，每项 `{value, basis}`。`value` 为非负数或 `null`；`basis` 为 `monotonic / wall_clock / unknown`，仅 unknown 对应 null。已有 `EvidenceModelResult.elapsedMs` 从准备到结果处理计时，映射 attempt 的 `totalMs`，不能赋给纯模型 `executionMs`。缺少排队或流开始观测时这两项为 unknown。起止墙钟差只能在适配器明确同一计时环境且无时钟倒退时使用，并注明 wall_clock；不能由不同进程时间计算可信时长。

根节点的 `totalMs` 是运行本身的区间，不能把父子、并发或不同阶段耗时相加。慢调用比较仅比较相同 kind、同一计时口径的已知值；未知值单列。汇总应分别计数逻辑 call、实际 attempt 和各自状态；统计 attempt 成功数不代表论文纳入数。

`failure` 为 `{code, phase, message}`。`code` 枚举 `timeout / transport / output_limit / parse / validation / admission / other / unknown`；`phase` 为 `prepare / admission / before_content / after_content / parse / unknown`。说明由允许的错误码映射到固定文案，不直接输出异常 message/stack。只知道 transport 时不得宣称是代理、用户网络或上游服务器故障。取消用状态表达，不伪装成超时。

## 查询与分页提案

拟议 RPC 名称为 `academicResearch.trace.list` 与 `academicResearch.trace.detail`，尚未注册。两者均要求现有 Session 访问权限，服务端校验 Session 与 run 所属关系；Trace ID 不能绕过权限。没有匹配记录返回 `not_found`，不会跨会话寻找。

- `list` 请求：`{sessionId, researchRunId, stage, status, cursor, limit}`，stage/status 可空表示不筛选；cursor 首次为 null，limit 为 1—100 的整数。
- `list` 成功响应：`{schemaVersion, status: "ok", traceId, snapshotId, items, nextCursor, summary, gaps}`。items 为最新 Span；按 Span 首次观察 sequence 升序、spanId 作稳定次序，不按最近修改时间翻页。summary 对整个运行的同一快照计算，不随筛选分页变化，字段为 `logicalCalls / attempts / attemptStates / runTotalMs / excludedUnlinkedRecords`。attemptStates 包含所有状态的数量。
- `detail` 请求：`{sessionId, researchRunId, snapshotId, spanId, cursor, limit}`；响应 `{schemaVersion, status: "ok", traceId, snapshotId, span, events, nextCursor, gaps}`。events 是该 Span 的观察序列，同样分页；子节点通过 list 获取，不在详情中无限展开。
- cursor 是服务端不透明令牌，绑定身份、筛选、排序、投影版本和固定 snapshotId；客户端原样传回。快照指固定事件水位，分页期间新事件不进入旧快照；刷新从 null 重新取。快照已清理返回 `snapshot_expired`，不拼接不同快照。
- 未就绪或错误响应统一 `{schemaVersion: 1, status, message}`；status 为 `not_ready / not_found / invalid_query / invalid_cursor / snapshot_expired / unsupported_version / unavailable`。消息为固定净化说明；权限拒绝继续使用现有 RPC 权限错误，不能返回其他会话是否存在。

去重先于投影和统计：相同 eventId 且内容完全一致只保留一次；相同 ID 内容冲突必须报告 `event_conflict`，不能静默最后写入覆盖。固定快照内相同 Span 的最后 sequence 决定当前状态；历史事件保留。数据缺口还包括 `timing_unavailable / parent_unknown / paper_unknown / run_link_missing / interrupted_observation / operation_unknown / source_unavailable`，不作为研究质量评分。

## 脱敏与保存

首版只提供安全摘要，不提供原始模型请求、响应流、推理文本、全文、证据摘录、Authorization、凭据配置、Cookie、环境变量、磁盘路径、URL 查询参数和异常堆栈。查询与导出使用相同允许字段，不因下载放宽。Provider/model/tool 标识需校验为配置中的公开标识；来源引用是受权限约束的记录键，不是任意文件打开接口。未知错误用固定文案，不靠正则替换密钥后直接导出原文。

投影可从已保存事实重建时不再复制原始正文。新增的运行/调用关联及重试调度如无法从历史重建，需要在 C-T1 提出版本化、可持久化的观察事件；不得覆写已发布 Session 代际。观察失败只影响 Trace 完整性，不改变报告质量或研究成功状态；数据不可用时显式返回 unavailable/gaps。不得通过再次调用模型或重新跑研究填补历史。

## 当前版本来源映射与缺口

本表是源码核对结果，不是已经完成采集。没有读取用户真实 Session 内容。

| 目标 | 已有来源 | 可读事实与限制 |
| --- | --- | --- |
| 事件稳定引用与顺序 | [SessionEvent](../../packages/core/session/src/types.ts) 的 `seq/time/type` | seq 在 Session 内有序；time 是 epoch 毫秒。投影引用需绑定 Session 与数据代际，不能让相同 seq 跨会话碰撞。 |
| 后台与研究关联 | [background-run.ts](../../packages/api/academic-research-controller/src/background-run.ts) 的 `academic/background-run-state` | 保存 backgroundRunId、sessionId、可空 retrievalRunId、状态和进度。任务刚启动时研究 ID 可空。后台 completed 不表示业务各阶段全部成功。 |
| 阶段与活动 | [progress.ts](../../packages/academic/workflow/src/progress.ts)，由后台状态保存 progress 快照 | 六阶段、sequence、activities、计数与时间。替换快照不能保证包含每次内部工具调用；不能仅靠最后快照重建全部尝试。 |
| 请求与模型结果 | [model-types.ts](../../packages/academic/workflow/src/model-types.ts)、[model-call.ts](../../packages/academic/workflow/src/model-call.ts) | evidence request/result 含 source、phase、fragment、attempt；result.requestSeq 可精确关联请求，但准备失败时为 null。elapsedMs 是准备至结算总耗时。旧事件缺 retrievalRunId 与跨重试的独立 callId，不能只凭论文和 attempt 合并。 |
| 综合调用 | [synthesis-model.ts](../../packages/academic/workflow/src/synthesis-model.ts) | request.input 和 result 有 retrievalRunId；结果有 requestSeq。单次请求关联可恢复，跨重试逻辑 call 身份仍需显式规则或新增记录。 |
| 候选审核 | [candidate-review-model.ts](../../packages/api/academic-research-controller/src/candidate-review-model.ts) | 保存 Brief、Work、Version、roundIndex、selectionSeq、requestSeq；Brief/round 不能单独证明属于某次研究，旧记录不能按标题拼接。 |
| 调用重试 | [model-call.ts](../../packages/academic/workflow/src/model-call.ts) 的 onAttempt | started/settled/retry_scheduled 回调存在，但它本身不是独立持久事件，未提供稳定逻辑 call ID 和完整排队计时。旧记录中不得伪造 retry_wait。 |
| 运行与增强结算 | [settlement-events.ts](../../packages/academic/workflow/src/settlement-events.ts) | run-settlement、enhancement selection/settlement 有 retrievalRunId；增强必须与原运行关联，单独操作，不把其完成当作原报告重新审核。 |
| 检索及全文工具调用 | progress/provider 活动、论文结果 | 可展示已观测操作和失败；不是完整通用工具调用 Trace。精确排队、每次工具尝试、调用父项需 C-T1 逐项核对接线。 |

## 实现位置与 A/B 反馈单

拟将统一品牌类型、纯投影与统计放在 `packages/academic/model/src/trace.ts` 及相邻纯模块；版本采集、查询与保存接线放在 `packages/api/academic-research-controller/src/trace/`；UI 放在 `packages/client/ui-academic-research/src/client/trace/`。这些均是待建路径。本次不增加包或依赖，不修改根配置。若纯投影使 model 不再保持共享定义职责，实施时拆出专用包并单独登记依赖，不让纯层引用 Session/Controller/UI。

| 待核对项 | A 合并路线 | B 迁入路线 | C 后续动作 |
| --- | --- | --- | --- |
| U0 事件稳定键、时间、排序和读权限 | 待反馈实际源码位置 | 待反馈实际源码位置 | 冻结 sourceRef 和分页水位映射。 |
| run 与后台、模型请求的精确关联 | 待反馈支持/缺失 | 待反馈支持/缺失 | 定义新增观察字段；旧记录缺失明确显示。 |
| call/attempt/fragment 重试标识 | 待反馈支持/缺失 | 待反馈支持/缺失 | 不用相同标题、attempt 号合并逻辑调用。 |
| 队列、执行、总耗时的观测与持久化 | 待反馈真实计时点 | 待反馈真实计时点 | 只实现可证明口径，其他保持 null。 |
| RPC 命名、品牌类型位置、投影存储和快照保留策略 | 待核对路由能力 | 待核对路由能力 | C-T1 明确配置与生命周期，再接生产入口。 |

请 A/B 用“支持＋源码位置”“缺失＋影响”或“待查”逐项填写自己的交接记录，并引用本提案；不要将本文直接视为已经冻结的运行时 API。C-T0 的样例校验只证明交接数据自洽，不证明 T0/U0 采集、持久化、权限或界面已经可用。
