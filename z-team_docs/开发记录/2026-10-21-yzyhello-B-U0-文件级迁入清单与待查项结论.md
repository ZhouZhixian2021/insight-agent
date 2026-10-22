# 开发记录：B-U0 文件级迁入清单、待查项结论与 U0 Web 基础运行

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-21 |
| 负责人 | yzyhello（B） |
| 协作人员 | 无 |
| 对应路线 | `upgrade/port-academic` |
| 工作目录 | `D:\agent-project\insight-agent-u0` |
| 分支 | `upgrade/port-academic` |
| 基线 | U0 = 上游标签 `dsh-v0.2.1-rc.2`；迁入基线 T0 = 团队 `origin/master` 固定提交（取值见[分工方案](../模块分工/academic-upstream-upgrade-dual-route-team-plan.md)） |
| dsh home | `<工作目录>/.dsh-runtime`（由 `scripts/start-insight-web.ps1` 注入） |
| 远程状态 | 随本记录提交推送 |

## 目的

完成[上游升级双路线与持续开发分工](../模块分工/academic-upstream-upgrade-dual-route-team-plan.md)第零轮剩余项：把学术迁入清单细化到文件级并登记来源提交，处理三项待查项，并验证 U0 Web 基础运行。

## 一、文件级迁入清单

新增[B 逐项迁入清单（文件级）](../模块分工/academic-port-file-inventory.md)：逐文件登记 342 个学术入口文件（`packages/academic` 255、`packages/api/academic-research-controller` 31、`packages/client/ui-academic-research` 51、`packages/preset/agent-presets/presets/academic` 5）的类别与最后修改时间跨度，列出 33 个必要基座文件的 U0 现状与迁入动作，并给出分批迁入顺序。

来源追溯改为可复现的命令而非逐行硬编码提交标识（仓库 `verify-repository-references` 禁止维护文件中出现提交哈希）：清单按包登记文件、类别与最后修改时间跨度，并给出按 T0 还原逐文件提交的 `git ls-tree`／`git log` 命令。T0 之后进入主线的唯一非文档增量是 `packages/api/academic-research-controller/tests/candidate-pool-handoff.spec.ts`（提交主题「补齐完整候选池筛选与送审交接」），随 Controller 一并迁入；这也解释了该目录 T0 为 31 个文件、团队 master 为 32 个。

## 二、待查项结论

三项在 U0 均已不存在：

- `packages/runtime-diagnostics/invariants`（`@deepseek-ai/dsh-invariants`）整体移除，含各包 `./invariant` 子路径，见 `docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants/guide.md`；U0 的 `packages/extensions/tool-cordis/src/api-catalog.ts` 已无 `invariants` 条目。
- `packages/code-runtime/` 无对应包组；T0 `packages/bundle/web-app/cordis.patch.yml:60` 与 `package.json` 中的 `code-runtime` 行在 U0 已消失，能力由 `packages/ptc-runtime`、`packages/experimental/webworker-runtime`、`packages/experimental/ptc-runtime-python` 承担。
- `packages/e2b/` 无对应包组，也无功能性引用。

学术入口对三项的引用为空（T0 上 `git grep -E "dsh-invariants|dsh-e2b|dsh-code-runtime|/invariant'"` 无命中）。结论：迁入范围与基座依赖可行性不受影响，基座文件一律取 U0 版本，不保留上述行或依赖。

## 三、U0 Web 基础运行验证

- `pnpm run build`：9 个 gate 全部通过（含 host／client 编译与聚合检查、Host／Desktop／Client bundle、Web build），用时 81.27s。
- `pnpm run build:check`：2 个聚合检查通过，用时 20.51s，退出码 0。
- `scripts/start-insight-web.ps1 -Port 8790 -NoOpen`：Web 服务启动成功，`DSH_HOME` 指向仓库内 `.dsh-runtime`，已生成 `profiles/web`、`storages`、`web.log`，未读写本机 `~/.dsh`。自动化终端那次改由 `cmd /c start` 拉起，因 `set DSH_HOME=... ` 末尾空格使运行目录落到仓库内同名的 `.dsh-runtime `（带空格）；两次都在仓库内隔离，验收后已删除该多余目录。
- HTTP 验证：带启动时打印的 token 访问 `http://127.0.0.1:8790/` 返回 200（37428 字节，标题 `DSH Local Build`）；不带 token 返回 401。验收后已停止该进程。

## 四、实际检查

| 命令 | 结果 |
| --- | --- |
| `git ls-tree` / `git log` / `git grep`（只读） | T0 在本地可用；342 个文件与 14 个子包统计与既有记录一致 |
| `pnpm run build` | 9 passed, 0 failed |
| `pnpm run build:check` | 2 passed, 0 failed，exit 0 |
| `scripts/start-insight-web.ps1 -Port 8790 -NoOpen` + HTTP 探测 | 200（带 token）／401（无 token） |
| `pnpm run test:docs` | 19 通过，2 失败（`verify-repository-references`、`verify-concrete-terms`）；失败行全部落在本次改动之前已提交的文件，新增文件零命中 |
| `git diff --check` | 通过（退出码 0） |

`verify-repository-references` 禁止维护文件中出现可解析到本仓库提交的哈希；`verify-concrete-terms` 命中既有 `z-team_docs/interface-samples/` 与 `z-team_docs/验收数据/`。两项在本分支上已是既有失败（未修改的 `z-team_docs/模块分工/academic-upstream-upgrade-dual-route-team-plan.md`、`z-team_docs/验收数据/**` 等同样在列）。本次按该规则把清单改为「包内文件列表 + 最后修改时间跨度 + 可复现的 `git ls-tree`／`git log` 命令」，不硬编码提交标识，未新增违规。

## 五、风险与限制

- U0 为候选版 `0.2.1-rc.2`，稳定版发布后需重新验证。
- 本次只验证基座启动与页面可达，未启动任何学术研究；学术链路仍全部未迁入。
- 第零轮要求的固定样本结果尚未保存，缺少旧版证据的验收项仍标为待补。
- 从自动化终端直接启动的 detached 进程会收到控制台 Ctrl+C 并以 `0xC000013A` 退出；需要常驻时用独立控制台启动（`cmd /c start`），否则前台运行。该现象属运行终端行为，与仓库代码无关。用 `cmd /c set DSH_HOME=<路径> && ...` 时不要把空格留在 `&&` 之前，否则会静默创建带空格的运行目录。
- `z-team_docs` 既有内容持续违反 `verify-repository-references`（提交哈希）与 `verify-concrete-terms`，`test:docs` 在本分支上是既有失败，不是本次引入；两条升级路线验收时都需要先把该问题登记清楚，或按规则清理共享文档。

## 六、下一步

按[B 逐项迁入清单](../模块分工/academic-port-file-inventory.md)第五节顺序执行 B-U1：先迁基座装配，使 Web 启动后可选到学术模式。
