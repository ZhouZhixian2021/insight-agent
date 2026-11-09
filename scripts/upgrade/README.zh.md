# 上游改写登记与生成物重放

[English](README.md) | 中文

本目录集中登记上游改写及其生成命令，供维护人从一份现行清单核对升级工作。

## 为什么需要它

`master` 是上游（[`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)）加我们自己的开发。二次开发有两条路：

- **新增文件**，包括 `packages/academic/*`，可以减少直接文件冲突，但仍依赖上游接口、构建规则和数据格式；
- **改写上游文件**，上游改动与本地修改重叠时需要审查合并。现行登记表为 `upstream-overrides.json`。

清单为每处改写记录维护责任人、原因和分类。生成物从其所属源码重建；新增业务模块所依赖的框架发生变化时，也需要核对兼容性。

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
- 已登记人工改写超过 `budget.maxForkFiles` 时检查失败。补登历史遗漏时仍需如实分类，即使这会暴露既有超额；应审查并退役确有替代的改写，不能靠改分类或提高上限隐藏维护债务。

## 生成物清单

`generated-map.json` 记录每个已登记生成物的重建命令。只有所属命令能完整重建的文件才归为生成物；人工代码与正文仍属于人工改写。

`replay-generated.mjs --apply` 会跑两遍并比对 `git status`：第二遍若产生任何变化就报错，因为那意味着有内容不是脚本算出来的。生成器要 spawn tsx 与 esbuild，受限沙箱会拒绝管道访问，所以这一步在正常终端里跑。
