# 开发记录：B-P1 来源与摄取进度事实

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-28 |
| 负责人 | B（yzyhello） |
| 协作人员 | A（zhouzhixian2021，接口边界确认） |
| 个人分支 | `dev/yzyhello` |
| 任务分支 | 无（直接在个人分支上开发） |
| 提交 | 本地工作区，未提交 |
| 远程状态 | 本地未推送 |

## 目标

为学术研究实时进度补齐 B 负责的来源与筛选事实：从 `dsh-academic-source` 发布逐 Provider 的检索活动（开始/成功/失败/取消），从 `dsh-academic-ingestion` 发布去重与版本保留计数。事实只由 B 的包发布，不修改 workflow/Controller；整轮聚合、协议投影与页面展示由 A、C 负责。

## 实际完成

- **来源 Provider 事实**（`packages/academic/source`）
  - 新增 `AcademicSourceProviderObservation`、`AcademicSourceProviderObserver`、`AcademicSourceProviderPhase`（`started`/`settled`）、`AcademicSourceProviderSettlement`（`success`/`failed`/`cancelled`）。
  - `AcademicSourceRuntime.searchAll(request, signal?, onProvider?)` 与 `searchProviders(request, providerIds, signal?, onProvider?)` 增加可选观察者；业务返回值不变。
  - 每个 Provider 在真正发起请求时**同步**发布 `started`（不等待 `Promise.all` 汇合）；结算后发布 `settled`，携带结算状态、失败 `category`、返回成果数与截断标记；调用方取消导致的 `ACADEMIC_SOURCE_ABORTED` 发布为 `cancelled`。
  - 观察者异常被隔离，不改变本轮结果；事实不带时间戳，由持有方打戳。
- **摄取去重计数**（`packages/academic/ingestion`）
  - 新增纯函数 `summarizeIngestAudit(outcome)` 与 `IngestAuditCounts`：
    - `mergedWorkIdentities` ← `merged_work`
    - `mergedVersionRecords` ← `merged_version`
    - `retainedWorkVersions` = `outcome.versions.length`（最终保留版本总数，非 `merged_version` 计数）
    - `suspectedDuplicateRecords` ← `suspected_duplicate`
- **边界遵守**：`EvidenceGenerator` 签名不变（模型分批/尝试/超时事实仍属 workflow）；Web 发现的识别/核验实时事实由 A 的混合检索编排层发布，B 的返回值只携带终态。
- **测试**
  - `packages/academic/source/tests/source.spec.ts`：新增 5 例（started 先于结算、失败分类、取消、观察者异常隔离、`searchProviders` 支持观察者）。
  - `packages/academic/ingestion/tests/ingest.spec.ts`：新增 2 例（合并身份/版本 vs 保留总数、疑似重复独立计数）。
- **文档**：两包 `README.md` + `README.zh.md` + `README.i18n.yaml`；新增 Agent Note 三件套 `.agents/notes/implemented/architecture/2026-09-28-academic-source-ingestion-progress-facts.{md,zh.md,i18n.yaml}`。

## 实际检查

- `pnpm exec vitest run packages/academic/source/tests/source.spec.ts packages/academic/ingestion/tests/ingest.spec.ts` → 2 文件 87 测试通过。
- `pnpm exec tsc -b packages/academic/source/tsconfig.json packages/academic/ingestion/tsconfig.json` → 通过。
- `pnpm exec tsx scripts/run-oxlint.ts packages/academic/source packages/academic/ingestion` → 通过（修正了一处 140 列超长行）。
- `pnpm run verify-translation-pairing` → 全部一致；`pnpm run verify-export-jsdoc` → 通过；`pnpm run verify-agent-note-format` → 通过。

## 风险与限制

- B 侧完成不等于端到端可见：Provider 活动与新计数要经 **A 接线**（controller 传观察者、映射进度协议、调用 `summarizeIngestAudit`、扩展 A-P1 字段与样例）并在页面上由 **C 展示**、真实联调后才算可见。
- 事实不带时间戳、按调用绑定；整轮 `partial_success`/`failed` 判定由 A 聚合，B 只发逐 Provider 事实。
- 观察在每次 Provider 请求开始前同步发布；若 Provider 内部不配合取消而继续执行，整轮取消仍以调用方信号为准，B 无法终止任意 Provider 代码。
- `retainedWorkVersions` 语义固定为 `outcome.versions.length`，与 `mergedVersionRecords` 严格分开，避免旧口径混用。

## 下一步

- A 接线：controller 适配器传入观察者并映射进度协议；调用 `summarizeIngestAudit` 填充 A-P1 扩展的可选 counts；更新 A-P1 协议、投影与固定样例；由 A 的混合检索编排层发布 Web 发现识别/核验的实时事实。（负责人：A）
- C 用真实进度数据流替换固定样例并完成页面展示。（负责人：C）
- 真实运行一轮做联调验收，确认快照中可分别看到 openalex/arxiv 的 Provider 活动与摄取计数。（负责人：A/C，待分配具体时间）
