# 2026-09-30 成员 A：Q5 缺口补检自动轮与 Session 持久化

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-30 |
| 负责人 | zhouzhixian2021 |
| 协作人员 | 无（复用 B 的 `extendPlanForEvidenceGaps` / `rankPlannedCandidates`） |
| 个人分支 | `dev/zhouzhixian2021` |
| 任务分支 | 无 |
| 提交 | 未提交 |
| 远程状态 | 本地未推送 |

## 目标

完成 Q5.1/Q5.2 记录里预留的两项下一步：一是让证据缺口决定真正执行一轮缺口补检并回到分批调度，二是在 Session 里为已审核计划、批次决定与结算建立持久化事件，为后续跨重启恢复固定稳定的 `SearchQueryId`。

## 实际完成

- 在 `packages/academic/workflow/src/pipeline-types.ts` 抽出 `CandidateScheduling`，新增 `ReplenishedCandidates` 与可选适配器 `replenishCandidates`；在 `pipeline.ts` 的 Q5 循环里，`search_evidence_gap` 现在调用该适配器执行补检并 `continue`，未注册适配器或无轮次余量时保持原来的“可见限制结束”行为。补检后按增量 `ingestWorks` 合并版本与作品标题，用 `reconcileSelectedPapers` 把新论文并入 `validated`/`byVersion`。
- 在 `packages/api/academic-research-controller/src/search.ts` 实现 `replenishRankedCandidates`：`extendPlanForEvidenceGaps` → 复用与正式轮相同的 `executeHybridSearch` 执行器 → 仅保留“精确标识未命中既有索引”的缺口记录做增量 `ingestWorks`（避免改变已排名作品的正则版本）→ 重建保守评估 → `rankPlannedCandidates` 重排 → 只返回本轮新解析论文。同时把评估构造抽成 `buildRanking`、把源/Web 绑定抽成 `hybridSearchAdapters`，供首轮与补检共用（决策：两套检索执行器合一）。
- 在 `packages/api/academic-research-controller/src/index.ts` 接入：新增 `gapRoundMaximumQueriesPerRound`（默认 4）与 `gapRoundMaximumAcademicResultsPerQuery`（默认 20）两个 Config，`approvedPaperAdapters` 增加 `onPlan` 回调和 `replenishCandidates` 返回。
- 新增 `packages/academic/workflow/src/settlement-events.ts`，声明四类 Session 事件：`academic/search-plan`、`academic/candidate-batch-decision`、`academic/candidate-batch-settlement`、`academic/run-settlement`，并定义 `AcademicSettlementObserver`。Controller 在运行前写 `search-plan`，在 Q5 循环里写批次决定与结算，在 `execute()` 结束时写 `run-settlement`。
- 手工把四个事件名补入 `packages/core/session/src/known-event-types.ts`（仍需跑生成器复核）。
- 更新 Agent Note `2026-09-30-academic-ranked-candidate-batch-scheduling`（中英）与 Controller README（中英），把“补检执行与 Session 恢复仍留待后续”改为“已实现，恢复仍留待后续”。
- 修复 `tests/hybrid-search-plugin.ts` 过时的 `approvedPaperAdapters` 调用，并给 `controller.host.spec.ts` 的模拟 Session 补上 `append`。
- 在 `packages/api/academic-research-controller/tests/controller.host.spec.ts` 增加项目级联调：首轮候选被证据范围排除后，真实 Controller 适配器会执行缺口查询，接收新候选并回到分批处理，同时断言 `search-plan`、批次决定、批次结算和运行结算事件均写入 Session。
- 在 `replenishRankedCandidates` 的增量合并处增加本轮精确标识去重，避免同一论文被多个缺口问题查询重复返回时制造重复版本并使排序器中止。
- 新增 `packages/api/academic-research-controller/tests/search.spec.ts`，覆盖旧论文重复命中、同轮跨查询重复、补检 Provider 全部失败、新论文全文不可解析、未批准直连 Provider、核验失败引用和检索来源契约等分支；内部构造函数保证不可达的防御分支按仓库规则保留防线并注明覆盖排除原因。

## 实际检查

- `pnpm run typecheck`：通过（修掉 3 处：`search.ts` 未用的 `WorkVersionId` 导入、`replenishRankedCandidates` 漏写 `async`、`candidate-batches.spec.ts` 断言用错的 `dateBasis` 值 `version_release` → `first_public_release`）。
- `pnpm run gen-persistence-catalog && pnpm run verify-persistence-catalog`：通过，四个新事件名与生成器一致，`known-event-types.ts` 与 `docs/persistence-catalog.md` 重新生成。
- `pnpm run lint`：通过（修掉 4 处：箭头函数括号、`hybrid-search-plugin.ts` 缩进、`pipeline.ts` 的 `no-unnecessary-condition` 改为外层信号 `signal?.aborted`）。
- 聚焦测试：workflow `replenishment.spec.ts` + `candidate-batches.spec.ts` 19/19，Controller 7 文件 122/122，`core/session` 273/273（含 `gen-persistence-catalog.spec.ts`）。
- 新增联调测试单独运行通过：`controller.host.spec.ts` 缺口补检用例通过，并确认首轮与缺口轮均经过真实 `searchProviders` 调用。
- Controller 测试目录覆盖运行：7 个文件、126 个测试通过；`packages/api/academic-research-controller/src/search.ts` 的 statements、branches、functions、lines 均为 100%。
- `pnpm run test`（全仓）：50 个失败，全部在未改动的包内且属 Windows 环境问题——`symlink` 需开发者模式/管理员权限（`EPERM`）、`sandbox-windows-acl` 的 ACL 授权、pwsh 路径解析、以及客户端 slot 渲染基础设施；无一是本变更触发。
- 暂未执行：`test:snapshot` 尚未录制缺口补检快照（需 key）。

## 风险与限制

- 缺口查询表达沿用 B 现有规则（TODO，先上线）：`coverage.questions[].gaps` 目前就是问题原文，`extendPlanForEvidenceGaps` 拼成 `<核心表达> <问题文本>`，质量可能偏弱；后续把缺口表达改为结构化短语再与 B 对齐。
- 恢复路径仅完成“写入”：从四类事件回读 `SearchQueryId`/`scheduled` 以续跑仍未实现。
- 缺口轮默认值（4 查询、20 结果/查询）为本方建议值，未经过实跑验证。

## 下一步

- 成员 A：录一条带缺口补检的 keyless 快照（`test:snapshot:record`，需 key）。
- 待分配：从 `academic/search-plan` 回读稳定 `SearchQueryId` 实现跨重启恢复。
