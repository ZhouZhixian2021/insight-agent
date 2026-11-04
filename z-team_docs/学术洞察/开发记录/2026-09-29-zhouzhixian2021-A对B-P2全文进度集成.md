# 开发记录：A 对 B-P2 全文进度集成

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-29 |
| 负责人 | A（ZhouZhixian2021） |
| 上游协作 | B-P2 全文获取与解析进度事实 |
| 开发分支 | `dev/zhouzhixian2021` |
| 提交状态 | 本地修改，尚未提交或推送 |

## 目标

把 B 在 `dsh-academic-evidence` 发布的逐候选全文事实接入 A 的 Academic 工作流进度。Web 页面继续只消费 A-P1 的统一快照，不直接依赖证据包的观察类型，也不改变 `EvidenceGenerator` 的请求或返回值。

## 完成内容

- `runResearchDraft()` 为每篇论文调用 `fetchAcademicFullText()` 时传入运行内观察者，并使用该论文的 `AcademicWorkId` 与 `WorkVersionId` 更新原有活动。
- 每个候选开始时发布 `fulltext_fetch`，`attempt` 和 `maximumAttempts` 分别取一基候选位置与候选总数。
- 候选失败且仍有后备地址时发布 `waiting_retry`，保留 B 提供的 `FailureCategory`；下一候选开始后清除活动上的旧失败，避免把新的运行状态显示为失败。
- HTML 或 PDF 被完整接受并解析后发布 `fulltext_parse`，随后才进入 `evidence_extract`。
- 调用方取消时，B 发布的 `cancelled` 事实先映射成论文活动，再由工作流结算整轮取消并清空活动；已经提交的阶段和计数保持不变。
- 观察者仍由 B 和 A 两层隔离，页面订阅异常不会改变全文获取或研究结算。
- 同步修正一条遗漏的 A-P1 测试断言，使候选上限测试验证搜索调用携带 Provider 观察者，而不是继续要求已经失效的双参数调用。

## 接口影响

本次没有新增 Remote 字段，也没有修改 Controller 请求、最终结果或 C 的页面类型。C 已使用的 `paper` 活动字段获得真实的 `operation`、`attempt`、`maximumAttempts` 和 `lastFailure`；固定快照格式保持第 1 版。

## 验证

- `pnpm exec vitest run packages/academic/workflow/tests/progress.spec.ts`：1 个文件、8 个测试通过。
- `pnpm exec vitest run packages/academic/workflow/tests`：9 个文件、205 个测试通过。
- `pnpm exec tsc -b packages/academic/workflow/tsconfig.json`：通过。
- `pnpm exec tsx scripts/run-oxlint.ts packages/academic/workflow`：通过。
- `pnpm run verify-agent-note-format`、两组定向 `verify-translation-pairing` 和 `git diff --check`：通过。
- 新增测试覆盖首个候选失败后回退、第二个候选开始、成功解析，以及整轮取消前的论文取消事实。

## 剩余工作

- A：把 Web 发现、引用识别和逐条核验的实时事实接入检索阶段。
- A：把证据模型的分段、尝试、超时、输出限制和验证计数映射到 `extraction` 论文活动。
- A/C：使用真实 Academic Web 运行联调候选回退和取消展示；本次单元测试不代替真实学术源验收。
