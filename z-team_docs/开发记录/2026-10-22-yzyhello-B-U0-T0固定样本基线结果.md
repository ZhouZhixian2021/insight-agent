# 开发记录：B-U0 第零轮 T0 固定样本基线结果

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-22 |
| 负责人 | yzyhello（B） |
| 协作人员 | 无 |
| 对应路线 | `upgrade/port-academic`（从 U0 起步迁入 T0 学术能力） |
| T0 基线 | 团队 `origin/master` 创建升级分支时的固定提交，取值见[分工方案](../模块分工/academic-upstream-upgrade-dual-route-team-plan.md#固定版本与分支) |
| 实际执行树 | `D:\agent-project\insight-agent\insight-agent`（团队主仓库 worktree），分支 `dev/yzyhello`；执行提交用 `git -C <该目录> rev-parse HEAD` 复现，不在此硬编码 |
| 方法 | 仅运行离线单元样本；未联网、未调用模型、未改源码 |
| 性质 | T0 回归对照基线，不代表任何升级或迁入已完成 |

## 目的

按[上游升级双路线与持续开发分工](../模块分工/academic-upstream-upgrade-dual-route-team-plan.md)第零轮步骤三，保存 T0 的固定样本结果，作为 B 迁入 U0 后的回归对照基线；缺少旧版证据的验收项标为待补。

学术源码在 T0 到实际执行 HEAD 之间没有非文档改动（[T0→master 增量登记](2026-10-21-yzyhello-B-U0-增量登记与迁入清单.md)第一节：唯一非文档增量是 `packages/api/academic-research-controller/tests/candidate-pool-handoff.spec.ts`）。因此在该 HEAD 上运行离线样本可代表 T0 学术源码的行为；下表同时登记两道命令。

## 命令与结果

| 命令（工作目录 = 团队主仓库 worktree 根） | 结果 |
| --- | --- |
| `pnpm exec vitest run packages/api/academic-research-controller/tests/candidate-review-handoff.spec.ts packages/api/academic-research-controller/tests/candidate-pool-handoff.spec.ts packages/academic/report/tests/minimal.spec.ts packages/academic/report/tests/directions.spec.ts packages/academic/workflow/tests/pe4-integration.spec.ts packages/academic/model/tests/claim-samples.spec.ts` | 6 files passed，20 tests passed，8.26s |
| `pnpm exec vitest run packages/academic packages/api/academic-research-controller` | 76 files：75 passed / 1 failed；1047 tests：1046 passed / 1 failed；27.90s |

## 已知 T0 缺陷（新增证据）

- `packages/academic/workflow/tests/replenishment.spec.ts:39`，用例 `bounded candidate replenishment > continues past unlinked papers and stops on usable evidence`：`AssertionError: expected "vi.fn()" to be called 4 times, but got 2 times`（`adapters.fetcher`）。单独复跑该文件仍为 18 tests / 1 failed，表现为确定性失败，不是并发抖动。
- 该缺陷在 T0 学术源码上已存在，属于共享业务基线的既有缺陷，B 迁入 U0 后需按同一固定样本复跑并登记是否复现，不把它算作迁入引入的回归。

## 固定样本资料位置（已在团队仓库内）

- 候选审核离线回放：`z-team_docs/验收数据/2026-10-20-candidate-review/scoring-handoff/`（8 篇固定论文，Pro/Flash 记录与评分对比）与 `full-pool-handoff/`（276 篇全池回放、审计与 manifest）。
- 接口固定样例：`z-team_docs/interface-samples/academic-model-v1/`（检索、证据、分析、进度、综合等固定 JSON）。
- 报告黄金输出：`packages/academic/report/tests/expected/minimal-report.md`、`question-report.md`、`direction-report.md`。
- 固定三题跨模块验收：`packages/academic/workflow/tests/pe4-integration.spec.ts`。

以上均在 T0 树内，可直接作为迁入后的对照输入；学生成本为零、无网络依赖。

## 风险与限制

- 本轮只运行离线单元样本，未启动模型、联网检索或整轮研究；不能作为真实研究验收。
- 实际执行 HEAD 为 `dev/yzyhello`，与 T0 固定提交不同；已按增量登记说明其学术源码等价，但严格意义上不是 checkout 到 T0 提交。
- U0 侧尚未迁入学术代码，因此本基线尚未在 U0 上复跑；对照要等 B-U1 基座装配与后续批次迁入后进行。
- 缺少旧版证据的验收项仍标为待补，不事后推断。

## 下一步

- B 完成 B-U1 基座装配后，先用上表两条命令在 U0 树复跑同一批离线固定样本，登记新增差异与既有失败是否复现。
- 第二轮（B-U3/B-U4）用小范围真实研究确认集成，与本基线分开举证。
