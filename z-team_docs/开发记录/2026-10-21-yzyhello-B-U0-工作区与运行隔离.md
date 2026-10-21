# 开发记录：B-U0 工作区与运行隔离登记

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-21 |
| 负责人 | yzyhello（B） |
| 协作人员 | 无 |
| 对应路线 | B 迁入路线 `upgrade/port-academic`（从 U0 起步，后续迁入 T0 学术能力） |
| 工作目录 | `D:\agent-project\insight-agent-u0`（独立 worktree，共用主仓库 `.git`） |
| 分支 | `upgrade/port-academic` |
| 基线 | U0 = `687f282e8625c6b8d11ff58211a90524be2e4317`（标签 `dsh-v0.2.1-rc.2`） |
| 本记录提交 | `chore(scripts): keep the port worktree dsh home inside the repository` |
| 远程状态 | 已推送 `origin/upgrade/port-academic` |

## 目的

按[学术洞察上游升级双路线与持续开发分工](../../模块分工/academic-upstream-upgrade-dual-route-team-plan.md)第零轮要求，为 B 的迁入路线准备独立工作目录，并把 dsh 运行数据隔离在仓库内，避免与本机 `~/.dsh` 及团队主仓库的运行数据互相污染。

## 环境与隔离

| 项目 | 固定值 | 说明 |
| --- | --- | --- |
| 工作目录 | `D:\agent-project\insight-agent-u0` | 与主仓库 `D:\agent-project\insight-agent\insight-agent` 分离 |
| dsh home | `<工作目录>/.dsh-runtime` | 由启动脚本设置，仓库级隔离 |
| 端口 | 默认 0（自动），约定测试用 8790 | 与 A 路线及主仓库区分 |
| node | v24.19.0 | 满足 `^22.19.0 \|\| >=24.0.0` |
| pnpm | 11.28.5（由 `packageManager` 固定） | 与主仓库 11.7.0 不同，故必须独立工作区 |

`DSH_HOME` 只从进程环境变量读取（不读 `.env`），因此隔离靠启动脚本注入，而不是配置文件。

本机 `~/.dsh` 仍保留原有 `profiles`／`sessions`／`skills`／`storages`／`.credentials.yaml`／`settings.yaml`，本工作区不读写它。

## 新增文件

- `scripts/start-insight-web.ps1`：镜像团队约定，启动前设 `$env:DSH_HOME = Join-Path $repositoryRoot '.dsh-runtime'`，`-Port`／`-NoOpen` 可传参。
- `.gitignore`：新增 `.dsh-runtime/`，避免仓库级运行数据被误提交（上游 `.gitignore` 原本只忽略 `.dsh-build/`、`.dsh-report/`）。

## 依赖安装

- 命令：在工作目录执行 `pnpm install`（首次需外网抓取 `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`）。
- 直连该 CDN 会 `ERR_PNPM_FETCH_TIMEOUT`；经本机 HTTP 代理 `http://127.0.0.1:9567` 后成功，耗时约 2 分钟。
- 代理只对该次命令设置，未修改本机或仓库的全局网络配置。

## 实际检查

- `pnpm dsh --version`（`DSH_HOME` 指向工作区）：输出 `0.2.1-rc.2`，源码启动正常。
- `git push origin upgrade/port-academic`：pre-push 钩子 `run-gates` typecheck 5 passed，推送成功 `687f282e86..b57801d34f`。
- 尚未运行 `pnpm run build` 与 `pnpm dsh web`，Web 端到端启动未验证。

## 风险与限制

- U0 是候选版 `0.2.1-rc.2`，后续稳定版可能要求重新验证。
- U0 上游目录与包名相对 T0 有变化（新增 `apps/`，新增 `browser-use`／`computer-use`／`deliverables`／`document`／`ptc-runtime`／`ssh`／`telemetry` 等包组），迁入对照须逐项登记。
- 本记录只覆盖第零轮环境准备，未开始任何学术能力迁入，未声明任何升级或迁移完成。

## 下一步

- 完成 T0→master 增量登记（10 个提交）与 U0 包名／目录变化对照，形成逐项迁入清单。
- 运行 `pnpm run build` + `scripts/start-insight-web.ps1` 验证 U0 Web 基础运行。
- 等 C 交付 Trace 最小统一字段后，执行 B-T0 观察点可行性核对。
