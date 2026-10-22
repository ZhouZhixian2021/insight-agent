# 开发记录：B-U1/U2 学术能力迁入与学术预设落地

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-22 |
| 负责人 | yzyhello（B） |
| 协作人员 | 无 |
| 对应路线 | `upgrade/port-academic`（从 U0 起步迁入 T0 学术能力） |
| 工作目录 | `D:\agent-project\insight-agent-u0` |
| 基线 | U0 = 标签 `dsh-v0.2.1-rc.2`；迁入源 = 团队 T0 `bee2f554` |
| 提交 | `4785581b72`（Web PDF）、`95ba81636d`（学术包与文档迁入）、`4feea6204f`（学术预设落地） |
| 远程状态 | 本地已提交，未推送 |

## 目标

按[B 逐项迁入清单](../模块分工/academic-port-file-inventory.md)第五节顺序，把 T0 学术能力落地到 U0 基座：先迁基座装配与学术包（对应 B-U1/B-U3/B-U4），再把学术预设适配为 U0 的 bundle patch 形式（对应 B-U2 的「学术模式可选」检查点）。

## 实际完成

- **Web PDF 能力**：`dsh-web` 增加 `pdf` body kind，`web-fetch-http` 保留 PDF 字节，`tool-web` 不再把原始 PDF 交给模型（`4785581b72`）。学术全文回退依赖该能力。
- **学术包迁入**：`packages/academic/**`（14 子包）、`packages/api/academic-research-controller`、`packages/client/ui-academic-research`（改为 `conversation.session.header.actions` 入口），以及 `known-event-types`、`bundle/web-app`、`api/remotes`、`slot-catalog`、持久化目录与 tsconfig/lockfile（`95ba81636d`）。
- **文档与决策笔记**：迁入被 README 直接引用的 `docs/subsystems/academic-insight|academic-source` 与全部 T0 学术 Agent Note（`.agents/notes/implemented/**`），并按 U0 的按章节 16 位哈希重录双语配对。
- **U0 接口适配**（在迁入文件中）：持久化读取改为 `(await reader.read(...)).events`；模型消息来源改用 `MessageSourceMap` 声明；Controller 移除 `fulltextFetchProvider`；学术 README 链接改为 U0 目标路径。
- **学术预设落地**（`4feea6204f`）：新增 `packages/bundle/web-app/presets/academic.patch.yml`，把 T0 目录式预设改写为 U0 的 `insert` 声明；研究技能迁到 `packages/bundle/web-app/presets/academic/skills/` 并由 `skill-filesystem` 按包路径挂载；`agent-preset-registry` 的 display fold 与 `ui-agent-preset` 文案字典增加学术预设显示名；bundle 清单、`editing-cordis-compositions` skill 列表、相关 e2e 断言同步更新；删除不再被读取的 `packages/preset/agent-presets/` 目录。

## 实际检查

- `pnpm exec vitest run <3 个固定样本>`：3 files / 24 tests passed（源码平面）。
- `pnpm exec vitest run packages/preset/agent-preset-registry packages/client/ui-agent-preset`：12 files / 241 tests passed。
- `pnpm exec vitest run --config vitest.e2e.config.ts apps/cli/tests/web-agent-presets.e2e.ts -t "supplies the shipped presets"`：1 passed（已断言 `['academic','cordis','minimal','ptc','standard']`）。
- `academic.patch.yml` 以自定义 `!!js` tag 解析成功：`id=academic order=5 plugins=10`。
- 全量 `web-agent-presets.e2e.ts`：22 passed / 14 failed；失败为环境性（学术包未构建 `lib/`、Windows `pwsh` 与 `bash` 差异、遗留会话状态），与本次 roster 断言无关，未据此判定通过。

## 风险与限制

- **浏览器黄金样例未刷新**：本机缺少 Playwright 浏览器，`agent-preset-authoring/section`、`agent-preset-selection/hero`、`menu` 三份 golden 因新增预设而需要刷新，合并前必须以构建后的浏览器运行执行 `pnpm run test:web:refresh`；`apps/web/tests` 的可见预设列表与菜单计数断言按推断更新，同样未在浏览器中执行。
- **plan mode 不再自动启用**：U0 的 `@deepseek-ai/dsh-plan-mode` 只接受 `section`，已移除 T0 的 `initialActive`／`missingExitRetries`，因此学术会话不再默认进入计划模式；审批前置流程需要一个 U0 侧机制或团队决定，当前未实现。
- **persona `{{cwd}}` 子句移除**：U0 的 system-prompt 不注册 `cwd` 变量，已按仓库说明删除该子句。
- **未构建**：本工作区未运行 `pnpm run build:artifacts`，学术包的 `lib/` 尚不存在，依赖构建产物的 e2e 需先构建。
- **仍缺的基座耦合文件**：`packages/client/ui-user-questions`（计划审批学术字段）、`packages/extensions/tool-cordis/src/api-catalog.ts`、`packages/test-support/session-snapshot/src/normalize.ts`、`packages/README*` 尚未迁入或核对。

## 下一步

- 运行 `pnpm run build:artifacts` 后，用构建产物复跑 `web-agent-presets.e2e.ts` 与浏览器 golden 刷新。
- 处理 plan mode 的初始启用方式，或与 A/C 确认学术审批入口的新形态。
- 继续迁入剩余基座耦合文件，并按清单第三节核对遗漏。
- 在 U0 树复跑 T0 固定样本两条命令，登记与 T0 基线的差异。
