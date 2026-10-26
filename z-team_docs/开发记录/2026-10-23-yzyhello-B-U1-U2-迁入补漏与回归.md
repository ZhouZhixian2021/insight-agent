# 开发记录：B-U1/U2 迁入补漏与回归

## 基本信息

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-10-23 |
| 负责人 | yzyhello（B） |
| 路线 | `upgrade/port-academic` |
| 工作目录 | `D:\agent-project\insight-agent-u0` |
| 提交状态 | 本轮修改留在工作区，未提交、未推送 |

## 完成范围

- 补入团队主线的 `candidate-pool-handoff.spec.ts`，保留固定验收 JSON 和 manifest 字节。
- 补齐学术包在文档标准中的八个 library 分类、九个间接 Model Experience 登记；调整四组 README 的 Summary，将详细说明保留在所属章节。
- 更新包组地图、Remote 装配说明和子系统导航；恢复 Cordis API 类型链接、服务角色、服务图及插件清单生成接线。
- 恢复 Academic evidence/synthesis 结果事件的流时钟、尝试耗时和首次内容延迟规范化；测试保留正文、用量、引用身份及未知耗时，避免规范化业务内容。
- 修正迁移测试中的旧技能路径、旧持久化读取返回值、旧 Web fetch 参数和固定 Session 代际文件名。
- 将 T0 补检用例中“无证据卡条目”的有效证据单独列为接受场景。该用例与现有一级最小证据支持不符；不改业务逻辑，补检文件 18 项通过。
- 已在隔离目录安装 Playwright Chromium，刷新预设设置页、菜单和会话标题栏三份 golden；浏览器实测包含新增 Academic research 入口。
- 为 19 个新学术事件与四个受来源联合类型影响的既有事件生成[持久化兼容确认](../../docs/persistence-changes/2026-10-23-academic-u0-port.md)。写入版本不变，保留已接受历史和已提交 Session 代际。

## 执行检查

| 命令 | 观察结果 |
| --- | --- |
| `pnpm run test:docs`（修改前） | 16 项通过、5 项失败；README 分类、摘要、Model Experience 三项已修复，历史记录与术语检查仍有失败。 |
| `pnpm exec vitest run packages/api/academic-research-controller/tests/plan-validation.spec.ts packages/api/academic-research-controller/tests/controller.host.spec.ts packages/academic/analysis/tests/direction-layout.spec.ts packages/academic/workflow/tests/model.spec.ts packages/api/academic-research-controller/tests/candidate-review-handoff.spec.ts packages/api/academic-research-controller/tests/candidate-pool-handoff.spec.ts packages/academic/report/tests/minimal.spec.ts packages/academic/report/tests/directions.spec.ts packages/academic/workflow/tests/pe4-integration.spec.ts packages/academic/model/tests/claim-samples.spec.ts` | 10 文件、204 项通过；包含 T0 约定的六个固定验收样本。 |
| `pnpm exec vitest run packages/academic/workflow/tests/replenishment.spec.ts` | 18 项通过。 |
| `pnpm exec vitest run packages/academic/workflow/tests/persistence-compatibility.spec.ts packages/session/session-persistence-jsonl/tests/native-source-admission.spec.ts packages/session/session-persistence-jsonl/tests/current-event-admission.spec.ts` | 3 文件、40 项通过；覆盖归属信息保留与未知必读事件拒绝处理。 |
| `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/agent-preset-authoring.e2e.ts apps/web/tests/agent-preset-selection.e2e.ts`，设置 `DSH_SNAPSHOT=refresh` 和本项目浏览器路径 | 2 文件、15 项通过。未执行真实模型研究。 |
| `pnpm run verify-package-readme-summaries`、`pnpm run verify-package-readme-model-experience` | 通过。 |
| `pnpm run gen-cordis-catalog`、`pnpm run gen-cordis-inspect-catalog`、`pnpm run gen-doc-graphs`、`pnpm run gen-plugin-packages` | 已生成所属产物。 |
| `pnpm run verify-persistence-changes` | 84 个 roots 与 17 条历史记录一致。 |
| `pnpm run build:artifacts`、其后的 `pnpm run build:check` | 首轮分别 7 项、2 项通过。后续完整 build 的 7 个产物任务均通过；新增测试 header 的字面量类型修正后，最后一次 build:check 的 Host/Client 两项均通过。 |
| `pnpm run doc-sync`（收口前） | 36 项通过、7 项失败。服务图分类、插件清单、持久化确认和子系统导航已针对修正，尚不能据此声称全量通过。 |
| `pnpm run lint` | 未通过；有迁入 Controller 和 plan-mode 对已弃用 Session 同步历史读取的调用。当前改动中的类型与布尔表达式诊断另行修正并定向检查。 |

## 收尾复检

- 本轮变更的 TS/TSX 文件通过定向 oxlint；全仓 lint 的 10 处已弃用同步 Session 读取仍待迁移。
- 文档标准单独复跑：22 项通过。API 目录分区和 tool-cordis 的四个文件另有 27 项通过；并行检查时出现的文档标准 5 秒超时，单独复跑未复现，未放宽超时。
- 本轮 11 组命名双语文档配对通过，git diff --check 通过。
- 持久化兼容确认已生成并复核：84 个 roots 与 17 条历史记录一致。
- 完整 doc-sync 尚未全绿；已修复项采用所属生成器与定向检查确认，历史记录、旧术语、CLI help 截止和 Windows 符号链接权限问题仍单列。

## 差异与剩余工作

- U0 保留侧栏计划预览和原有审批操作；本轮没有把 T0 审批卡的展开布局覆盖到新版。学术 JSON 折叠和专门修改入口仍需明确适配方式，并验证真实批准到研究启动。
- `verify-repository-references` 仍拒绝既有开发记录及验收资料中的提交标识；`verify-concrete-terms` 仍拒绝迁入注释与固定验收数据中的旧术语。不能通过改写冻结数据来掩盖失败。
- 全仓 lint 的 10 处 Session 弃用调用已在后续收口中迁移；见下节最终结果。
- CLI help 检查的隔离 ACP 子进程被 30 秒截止终止；另一次直接调用因默认用户目录写入被沙箱拒绝。两者分别记录，不能推断为相同原因。
- 文档站测试有 Windows 文件符号链接权限失败；子系统导航遗漏已修复并定向通过，主机权限下复跑仍为 63 项通过、符号链接用例 1 项 EPERM 失败，属于当前 Windows 权限限制。
- 尚未做真实模型、联网检索、完整计划审批到研究、取消与重启恢复验收；HTML 与 Trace 实现未集成。
- B-T0 是迁入前的基座核对记录，其中学术层待查项需要后续更新，不能直接视为已支持。

## 后续入口

按[逐项迁入清单](../模块分工/academic-port-file-inventory.md)进入 B-U2 学术计划生成、修改、批准、后台研究启动及刷新恢复验收；本轮不改变双路线选型或 master。

## 后续收口：B-U1 启动检查与会话读取

- Controller 的九处同步历史读取迁移为现有 `sessionQuery.readSession`；同一次审批与恢复准入共用快照，读取失败会停止研究调度。补齐服务注入、包依赖、工程引用、锁文件与[自定义组合升级说明](../../docs/upgrade-guide/v0.2.1-rc.2/academic-session-query/guide.md)。
- 计划模式从 `plan` 投影读取最近审批调用轮次，删除每轮历史扫描；缓存状态版本递增并从日志重建，客户端 `{ active, pending }` 与 Session 事件格式不变。
- 后台运行列表跨越异步历史读取时，保留在途条目的最新终态，避免任务完成并退出注册表后被旧快照误报为中断；新增确定性并发回归。

| 最终检查 | 结果 |
| --- | --- |
| `pnpm exec vitest run packages/plan/plan-mode packages/api/academic-research-controller/tests/controller.host.spec.ts` | 4 文件、167 项通过，含读取失败、并发完成与冷回放审批轮次。 |
| `pnpm run build` | 最后一次完整构建 9 项通过，包含最新产物后的 Host/Client 汇总检查。 |
| `pnpm run lint` | 退出码 0；已消除 10 处弃用调用。另有未修改实验包的既有 unused-disable 警告。 |
| `pnpm install --lockfile-only --frozen-lockfile --ignore-scripts`（主机权限） | 1725 个条目的供应链校验通过；锁文件只新增一个已有仓库包的三行引用。后续主机权限浏览器命令的依赖同步也已完成。 |
| 普通计划审批浏览器回放 `apps/web/tests/plan-review.e2e.ts`（主机权限，`DSH_SNAPSHOT=replay`） | 7 项行为断言通过；文件级结算仍失败：Windows 自动发布的 ACL 诊断技能多出一条模型可见日志，与跨平台已提交 Session 样本不同。未修改历史 JSONL 或抹除该输入。 |
| `pnpm run verify-upgrade-guides`、三组命名双语配对检查 | 通过。审批界面两份 golden 已补齐实际观察到的 Q6 与 Academic research 入口。 |
| `pnpm run verify-md-links`、`pnpm run verify-persistence-changes` | 2166 个文档链接通过；84 个 roots 与 17 条持久化历史记录一致。 |

B-U0 准备已结束，B-U1 以无密钥基础启动、模型选择配置与入口检查收口。B-U2 的学术专用结构化计划生成、修改与批准，再到 Controller 启动、进度落盘和刷新查询仍待端到端验收；普通计划回放与单元测试不能替代该结果。完整真实研究、取消与恢复归 B-U3/U4，C 的 HTML/Trace 集成归 B-U5。全量 doc-sync 仍保留上文登记的问题，不能宣称全仓检查全部通过。
