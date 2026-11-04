# 上游改写登记与生成物重放

> 历史原稿：数量、路径、命令和实施状态保留当时背景。当前使用请从 [上游合并资料](../../00-目录.md) 进入，勿用历史工具覆盖仓库现行实现。

这个目录把"我们对上游的改动"变成可检查、可重算的数据，而不是散落在 129 个文件里的记忆。

## 为什么需要它

仓库的 `master` 是 upstream（`deepseek-ai/deepseek-harness`）加我们的二次开发。二次开发有两条路：

- **新增文件**（`packages/academic/*` 等 998 个）——上游没有同名文件，永远不会冲突；
- **改写上游文件**（本目录登记的 175 个）——上游动过同一区域就冲突。

第二条路是升级成本的唯一来源。这里做两件事：让每一处改写**有主、有理由、有上限**，并让其中的生成物**不参与人工合并**。

## 日常命令

```sh
# 门禁：清单与工作树是否一致（CI 与本地都跑这个）
pnpm run upgrade:check

# 更严：额外禁止新增改写路径（PR 相对 origin/master）
pnpm run upgrade:check:strict

# 只看哪个文件还缺 owner / reason
node scripts/upgrade/verify-upstream-overrides.mjs --report

# 生成物重放：按清单重算，再跑一遍证明幂等
pnpm run upgrade:replay

# 只看重放计划，不执行
node scripts/upgrade/replay-generated.mjs
```

`--allow-stale` 只在升级合并窗口内使用：那段时间清单必然与树不一致，合并完成后必须重新跑通门禁。

## 升级时怎么用

1. `git merge` 之前先记下 `UPSTREAM_SHA=$(git rev-parse upstream/master)`；
2. 合并冲突里，**生成物一律取上游一侧**：`node scripts/upgrade/verify-upstream-overrides.mjs --restore-generated`；
3. 解完源码与依赖清单，跑 `pnpm install`；
4. `pnpm run upgrade:replay` 重算全部生成物（第二遍必须零变化）；
5. 跑 `pnpm run build:artifacts && pnpm run build:check` 与其余门禁；
6. 补登新出现的改写路径，然后跑 `pnpm run upgrade:check`。

## 加一个新改写要做什么

在 `upstream-overrides.json` 的 `entries` 里加一条：

```json
{ "path": "packages/foo/src/index.ts", "category": "fork", "owner": "名字", "reason": "为什么必须改上游这个文件" }
```

- `category` 只能是 `fork`（手工改写）、`generated`（脚本产物）、`wiring`（接入点）；
- 标成 `generated` 但文件里没有生成标记、也不在 `generatedExemptions` 里，门禁会判为分类错误；
- 新增一条 `fork` 就会让计数超过 `budget.maxForkFiles`，门禁失败——这是有意的：**改写的数量只能减少**。

## 生成物清单

`generated-map.json` 记录 40 个生成物分别由哪条命令重算。判断标准是同一件事：**这个文件能不能被一条命令完整重建**。能，就不该有人工编辑，升级时也不该有人工合并。

`replay-generated.mjs --apply` 会跑两遍并比对 `git status`：第二遍若产生任何变化就报错——那是"假生成"的信号，说明有内容不是脚本算出来的。

生成器要 spawn tsx/esbuild，受限沙箱里会因管道访问被拒而失败，所以这一步需要在正常终端或未受限环境里跑。
