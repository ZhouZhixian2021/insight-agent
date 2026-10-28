# 在这个分支线里工作

[English](working-in-this-fork.md) | 中文

本仓库以 `deepseek-ai/deepseek-harness` 为上游，并在其上维护第二条开发线。每个纳入版本控制的文件都属于三类之一，类别决定一次改动能对它做什么。下列规则让上游差异保持可控，也让每次升级的冲突成本可预期。

## 1. 改之前先判断文件类别

| 类别 | 怎么认出来 | 改动能做什么 |
|---|---|---|
| 新增文件 | 上游没有这个路径 | 随意改动；它不可能冲突 |
| 生成物 | 路径出现在 [generated-map.json](../../scripts/upgrade/generated-map.json) 里 | 绝不手改；重新生成 |
| 上游文件 | 该路径上游也存在 | 仅在行为无法放进新增文件时才改，并登记这条改写 |

`git log --follow -- <path>` 加上与上游远端的比较即可确定类别。登记步骤见第 4 节。

## 2. 把新行为放进新增文件

对上游文件的一次改写要付两次代价：写的时候一次，之后每次升级碰到相同行时再一次。把定制的实现挪进新增文件，上游文件里只留一个挂钩。

Session 格式迁移的包就是这种形态：`academic.ts` 承载学术事件的处理，上游的迁移文件里只留一次构造调用和一次成员判断。当对上游文件的改动超过几行，先确认多出来的部分能否挪到新增文件。

## 3. 绝不手改生成物

生成物覆盖配置目录、持久化目录、模块图、Cordis 与 Client API 目录、文档图谱、`pnpm-lock.yaml` 以及译文记录。每一类都有对应的生成命令。

```sh
pnpm run doc-sync              # every documentation generator with its --check mode
pnpm run upgrade:replay        # the full generated set, twice, comparing git status
```

`--check` 变红表示生成物落后于源文件。重新生成它；手工把输出改成与源一致，等于把源抄进一个下一轮会被覆盖的文件。

## 4. 登记每一条上游改写

[upstream-overrides.json](../../scripts/upgrade/upstream-overrides.json) 为每条上游文件改写记录类别、负责人、原因，以及近半年上游改动频次。门禁把它当作白名单读取。

```sh
pnpm run upgrade:check --against origin/master
```

未登记的上游文件改动会让门禁失败；已登记但已不再与上游有差异的路径同样会让它失败。在与改动同一个提交里补上条目，原因要说明为什么这条改动无法放进新增文件。

## 5. 遵守结构性约束

有三条约束导致的报错不会指出真正的原因。

- workspace 包名必须等于 `@deepseek-ai/dsh-<目录名>`。不相等时别名生成器会跳过该包，TypeScript 路径需要在 [tsconfig.base.json](../../tsconfig.base.json) 里手写一条。
- 文档与目录生成器只按一层读取 [tsconfig.host.json](../../tsconfig.host.json) 的 `references`。在其下嵌套 solution 文件会让它们报告服务角色分类过期。
- 生成的目录内含源码行号。改动被目录收录的源文件并导致行号位移时，必须在同一个提交里重新生成该目录。

## 6. 新增 CI 检查单独建工作流

`ci.yml` 是上游文件，也是登记在册的改写；往里加检查会扩大每次升级都要合并的面积。新检查放进 `.github/workflows/` 下独立的工作流文件。

## 7. 文档成对存在

每个在范围内的 Markdown 文件都有配对文件与哈希记录，遵循 [i18n 约定](../i18n/README.zh.md)。成对的围栏代码块必须逐字节相同，两侧的第二行都是语言切换链接。

```sh
pnpm run verify-translation-pairing --write docs/cookbook/working-in-this-fork.md
```

两侧都改完后由 `--write` 记录配对哈希；它不负责翻译。

## 8. 引用版本而不是提交哈希

纳入版本控制的文本写发布标签或 PR 编号。`verify-repository-references` 拒绝文档中的裸提交标识。

## 9. 先安装再相信类型错误

workspace 软链接缺失时，TypeScript 会对一个确实存在的包报 `TS2307`。遇到找不到模块，先运行安装，再考虑改导入。

```sh
pnpm install --frozen-lockfile
```

## 10. 用 CI 的同一套门禁验证

```sh
pnpm run typecheck        # host and client aggregates, plus every leaf project
pnpm run lint             # compile the referenced projects, then oxlint
pnpm run doc-sync         # documentation generators in check mode
pnpm run upgrade:check    # upstream rewrite ledger
```

## 升级上游

完整流程（含生成物处理与登记表更新）在 [scripts/upgrade/README.md](../../scripts/upgrade/README.zh.md)。简版：从本仓库的 `master` 开分支，合并一个固定的上游提交，把生成物恢复成上游一侧，处理源码与依赖，重放生成物直到第二遍没有变化，运行 `pnpm run build:artifacts` 与 `pnpm run build:check`，然后以 `--no-ff` 合回并打发布标签。
