# 开发记录：B-T0 Trace 观察点可行性核对（迁入路线 U0）

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-22 |
| 负责人 | yzyhello（B） |
| 协作人员 | 无（核对对象为 C 的 C-T0 交接） |
| 对应路线 | `upgrade/port-academic`（从 U0 起步迁入 T0 学术能力） |
| 工作目录 | `D:\agent-project\insight-agent-u0` |
| 分支 | `upgrade/port-academic` |
| 基线 | U0 = 标签 `dsh-v0.2.1-rc.2` |
| 核对对象 | [Academic Trace v1 接口交接（C-T0）](../模块分工/academic-trace-v1-interface-handoff.md) |
| 方法 | 只读读取 U0 源码；未改源码、未联网、未启动服务 |

## 目的

按[上游升级双路线与持续开发分工](../模块分工/academic-upstream-upgrade-dual-route-team-plan.md)第零轮步骤五，C 已交付 Trace v1 接口提案与固定样例，B 作为迁入路线负责人对提案的「A/B 反馈单」给出 U0 基座的可采集性反馈，供 C 在 C-T1 之前冻结接口。本文引用该提案，不把它当作已注册的运行时 API。

## 结论摘要

- U0 基座可直接支撑：Session 事件的稳定顺序键与时间、事件类型白名单、按格式代际不可变的会话持久化、RPC 层会话读权限、品牌 ID、投影注册表与持久化投影缓存、存储根。
- U0 基座不提供：逐事件稳定 ID（事件信封没有 `id`/`eventId`，只有 `seq`）、文件系统级会话 ACL。提案中的 `eventId` 只能由 `(sessionId, seq)` 或来源记录键派生。
- 提案涉及的运行/后台关联、模型 `requestSeq`、逐次尝试标识、逐次排队与执行耗时，都属于 T0 学术代码（`packages/academic/**`、`packages/api/academic-research-controller/**`），**尚未迁入 U0**，本记录按「待查」登记，随 B-U1 至 B-U4 迁入后逐项复核对。
- U0 的 Remote 端点是 `namespace/method` 斜杠形式，不是点分 `a.b.c`；提案拟议的 `academicResearch.trace.list` / `.detail` 需要映射为该形式。

## 逐项反馈

下表按提案「实现位置与 A/B 反馈单」的五项，给出 B 迁入路线（U0 基座）的结论与证据。

| 待核对项 | B（U0 基座）结论 | 证据（U0 源码位置） |
| --- | --- | --- |
| U0 事件稳定键、时间、排序和读权限 | **支持（基座部分）**。事件信封为 `{type, seq, time, data, ignorable?}`；无逐事件 `id`，稳定键为 `seq`（`SessionSeq` 品牌整数），`seq = log.length` 连续性契约；`time` 为 `Date.now()` 的 epoch 毫秒。读权限只在 RPC 层，文件系统无 ACL。 | 信封 `packages/core/session/src/types.ts:494-517`；`seq` 品牌 `types.ts:32-45`；顺序契约 `packages/core/session/src/index.ts:756-758`、赋值 `index.ts:819`；`time` 单位 `types.ts:499`、来源 `index.ts:820`；信封键白名单 `index.ts:201-242`；事件类型白名单 `packages/core/session/src/known-event-types.ts:22-85`；RPC 授权 `packages/api/gateway/src/index.ts:785-809`、`packages/api/remote-access/src/index.ts:199-244`；会话资源注册 `packages/api/session-controller/src/index.ts:159`、读端点 `:524`、`:536` |
| run 与后台、模型请求的精确关联 | **待查**。提案依据的 `academic/background-run-state`、模型 `requestSeq`、`retrievalRunId` 属于 T0 学术代码，U0 尚无该包；U0 只有通用 Session 事件、投影注册表与持久化投影缓存可作承载。 | 学术包在 U0 不存在；投影承载 `packages/session/session-projection/src/index.ts:199`、缓存 `packages/session/session-projection-cache/src/index.ts:104`、域 `.../src/spec.ts:100-107` |
| call/attempt/fragment 重试标识 | **待查**。模型调用 `onAttempt`、`attempt`、跨重试逻辑调用身份均在 T0 学术代码；U0 基座无对应持久事件。提案「不得按标题/attempt 号合并逻辑调用」的限制在 U0 侧同样成立。 | 学术包在 U0 不存在 |
| 队列、执行、总耗时的观测与持久化 | **部分支持，余待查**。U0 基座持久化的是 token 用量与会话投影（含统计行），逐次模型/工具的排队与执行耗时属于学术层，尚未迁入。 | 投影注册表 `packages/session/session-projection/src/index.ts:199`、行类型 `:127-137`；`dsh-token-meter` 存在于 U0 `packages/` |
| RPC 命名、品牌类型位置、投影存储和快照保留策略 | **支持（给出映射）**。端点必须是 `namespace/method` 两段；品牌助手在 `dsh-brand`；投影存储用持久化投影缓存域（per-record，随存储根）；客户端 Remote 注册表是手写清单。 | 端点解析 `packages/api/gateway/src/index.ts:1252-1256`、`packages/api/gateway/src/client/index.ts:769-771`；品牌 `packages/util/brand/src/index.ts:18`；示例品牌 ID `packages/core/session/src/types.ts:21`；存储根 `packages/bundle/base/cordis.patch.yml:138-141`、`:182-190`；投影缓存域 `packages/session/session-projection-cache/src/spec.ts:100-107`；客户端清单 `packages/api/remotes/src/client/index.ts:188-196` |

## 对 C 接口的具体请求

- `eventId`：U0 没有逐事件 ID，请允许以 `(sessionId, seq)` 或来源记录键派生，并保留同会话内 `seq` 与数据代际绑定，避免跨会话碰撞。
- `sourceRef`：U0 可用 Session 的 `seq/time/type` 作稳定引用；`time` 可空，`seq` 在同会话内有序。
- RPC 命名：请按 U0 的 `namespace/method` 形式给出，例如 `academicResearch.trace` 命名空间下的 `list`、`detail`；提案中的点分名称不作为 U0 可直接注册的名称。
- 快照与保留：可复用持久化投影缓存域的 per-record 与版本机制；快照过期语义需要 C 明确，U0 侧只提供承载，不预先承诺保留窗口。
- run/后台/模型请求关联、尝试标识、逐次计时三项：请在 C-T1 之前保持「缺失即未知」，B 会随学术代码迁入逐项补证据，不按标题或时间相近补造。

## 实际检查

只读的 `grep`／读取，未运行模型、联网检索或启动服务。本记录引用的 U0 源码位置均为文件内静态事实；未对真实用户 Session 数据做核对。

## 风险与限制

- 本记录只覆盖 U0 **基座**能力；提案所需的大部分学术层观察点在迁入前无法给出「支持」结论，已按「待查」登记，不能当作缺失。
- U0 为 `0.2.1-rc.2` 候选版，稳定版发布后需重新核对事件信封与持久化代际。
- 本文不新增 TypeScript 类型、Session 事件或 Remote API；不改变 C 的提案字段含义。

## 下一步

- C 按本反馈调整接口（尤其 `eventId` 派生与 RPC 命名），进入 C-T1 实现当前版本。
- B 在 B-U1 至 B-U4 迁入学术代码时，逐项补齐本表「待查」项的证据，再执行 B-T1 的新版采集适配。
