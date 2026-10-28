# 上游改写登记与生成物重放

[English](README.md) | 中文

这个目录把"我们对上游的改动"变成可检查、可重算的数据，而不是散落在 129 个文件里的记忆。

## 为什么需要它

`master` 是上游（[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)）加我们自己的开发。二次开发有两条路：

- **新增文件**（`packages/academic/*` 等 998 个路径）——上游没有同名文件，永远不会冲突；
- **改写上游文件**（本目录登记的 175 个）——上游动过同一区域就冲突。

第二条路是升级成本的唯一来源。这个目录做两件事：让每一处改写有主、有理由、有上限，并让其中的生成物不参与人工合并。

## 日常命令

```sh
# Gate: do the manifest and the working tree agree? CI and local runs both use this.
pnpm run upgrade:check

# Stricter: also reject new rewrite paths (PR against origin/master).
pnpm run upgrade:check:strict

# List the files still missing an owner or a reason.
node scripts/upgrade/verify-upstream-overrides.mjs --report

# Replay generated artifacts, then run again to prove idempotence.
pnpm run upgrade:replay

# Print the replay plan without executing it.
node scripts/upgrade/replay-generated.mjs
```

`--allow-stale` 只在升级合并窗口内使用：那段时间清单与树必然不一致，合并完成后必须重新跑通门禁。

## 预判下次升级

合并之前先跑一次影响报告。它把上游自基线以来改过的文件与登记表求交，冲突面在动手之前就已知，而不是逐个 hunk 才发现。

```sh
node scripts/upgrade/impact.mjs
node scripts/upgrade/impact.mjs --fail-on-overlap
```

## 升级时怎么用

1. 合并之前先记下 `UPSTREAM_SHA=$(git rev-parse upstream/master)`；
2. 冲突里生成物一律取上游一侧：`node scripts/upgrade/verify-upstream-overrides.mjs --restore-generated`；
3. 解完源码与依赖清单，跑 `pnpm install`；
4. 跑 `pnpm run upgrade:replay` 重算全部生成物（第二遍必须零变化）；
5. 跑 `pnpm run build:artifacts && pnpm run build:check` 与其余门禁；
6. 补登新出现的改写路径，然后跑 `pnpm run upgrade:check`。

## 加一个新改写要做什么

在 `upstream-overrides.json` 的 `entries` 里加一条：

```json
{ "path": "packages/foo/src/index.ts", "category": "fork", "owner": "name", "reason": "why upstream's file itself must change" }
```

- `category` 只能是 `fork`（手工改写）、`generated`（构建产物）、`wiring`（接入点）；
- 标成 `generated` 但文件里没有生成标记、也不在 `generatedExemptions` 里，门禁会判为分类错误；
- 新增一条 `fork` 就会让计数超过 `budget.maxForkFiles`，门禁失败——这是有意的：**改写的数量只能减少**。

## 生成物清单

`generated-map.json` 记录 40 个生成物分别由哪条命令重算。判断标准始终是同一件事：**这个文件能不能被一条命令完整重建**。能，就不该有人工编辑，升级时也不该有人工合并。

`replay-generated.mjs --apply` 会跑两遍并比对 `git status`：第二遍若产生任何变化就报错，因为那意味着有内容不是脚本算出来的。生成器要 spawn tsx 与 esbuild，受限沙箱会拒绝管道访问，所以这一步在正常终端里跑。
