# DSH 上游升级与二次开发解耦方案

> 历史原稿：数量、路径、命令和实施状态保留当时背景。当前使用请从 [上游合并资料](../00-目录.md) 进入，勿用历史工具覆盖仓库现行实现。

## 0. 结论先行

| 事实 | 数值 |
|---|---|
| 你的分支相对上游的差异文件 | 1083 |
| 其中纯新增（不碰上游） | 908 |
| 其中修改上游文件（真正的维护负担） | 175 |
| 被删除的上游文件 | 0 |

结论：**成本几乎全部集中在 175 个"改上游源码"的文件上**，908 个新增文件基本零冲突成本。所以方案的核心不是"怎么合得更快"，而是两件事：

1. 用固定的前向合并流程，让每次升级变成一套可重复动作；
2. 持续把那 175 个往下压——能从"改上游源码"降级为"配置/补丁层"的，全部降级。

## 1. 为什么不做 rebase / 补丁栈

- `master` 已经发布，且 `master-new` 上还有其他成员在工作，改写历史会波及他人；
- 定制里有 908 个新增文件，rebase 要逐个重放提交，比合一次冲突慢；
- 前向合并只要求"解决冲突"，不要求"重放提交"，且历史只前进。

**选定模型：master 承载产品，每次上游更新开一条短生命周期的 `upgrade/<版本>` 集成分支，前向合并、验证、再合回 master。**

## 2. 分支模型

| 分支 | 角色 | 生命周期 | 谁写 |
|---|---|---|---|
| `upstream/*` | 只读镜像 | 永久 | 任何人都不写 |
| `master` | 产品主干 | 永久 | 只接受从 `upgrade/<ver>` 合入 |
| `upgrade/<ver>` | 一次上游更新的集成分支 | 一次升级 | A |
| `dev/*` / `custom/*` | 特性分支 | 短 | B/C |
| `master-new` | 其他成员的工作 | 未知 | **禁止触碰** |

`upgrade/merge-upstream` 现在就是这个模型里的"0.2.1-rc.2 接管分支"，只是名字没带版本号。

## 3. 定制分层（决定长期成本）

| 层 | 内容 | 冲突成本 | 现有规模 |
|---|---|---|---|
| L0 新增包 | `packages/academic/*`、`api/academic-research-controller`、`client/ui-academic-research` 等 | ≈0 | 908 文件的主体 |
| L1 配置/预设 | `presets/*.patch.yml`、`cordis.yml`、academic preset 的 skills | 低 | 少量 |
| L2 上游源码改写 | 见下方分布 | 高，全部负担 | 175 文件 |

175 个改写的分布：

```
packages/web            17
packages/session        16
.agents/notes           12
apps/cli                10
packages/client          9
docs/subsystems          9
packages/test-support    7
packages/plan            7
packages/llm             6
packages/api             5
packages/bundle          5
```

**规则：每一个 L2 改动都必须能回答"为什么不能放到 L1"。答不出来的，就是下一个重构目标。**

## 4. 每次升级的固定 8 步

```sh
# 0. 记录基线（写进 upgrade-prep-a，不进仓库）
#    当前 master SHA、上游 SHA、`git diff --name-status upstream/master..master` 存档

# 1. 取上游（含标签）
git fetch upstream --tags

# 2. 从上游顶点开集成分支（<ver> 用上游版本号，如 0.2.2）
git switch -c upgrade/<ver> upstream/master

# 3. 前向合并产品主干
git merge master            # 有冲突就停下，不自动解决

# 4. 解冲突：只允许碰 L2 清单里、且上游这次真的改过的文件
#    解完按文件记一份"冲突清单"，进台账

# 5. 跑验收门（见第 5 节），全绿才能继续
#    若 9 个 academic SDK 场景在写入器对比点失败，按 5.1 重建基线（固定动作，不是救火）

# 6. 更新台账：上游 SHA、冲突文件数、冲突 hunk 数、门禁结果

# 7. 合回产品主干并打标记
git switch master
git merge --no-ff upgrade/<ver>
git tag custom-<ver>

# 8. 推送 master 与标签（集成分支保留备查）
git push origin master custom-<ver>
```

## 5. 验收门（顺序固定，前一层不过不跑下一层）

| 层 | 命令 | 说明 |
|---|---|---|
| 静态 | `pnpm typecheck`、`pnpm lint`、`pnpm duplication`、`pnpm build:check` | 约 2–4 分钟，必须先绿 |
| 行为 | 聚焦 `vitest run <相关包>`、`pnpm test:snapshot`、`pnpm test:expected` | 快照只能按新模板重记，禁止为了让测试通过而改断言语义 |
| 文档 | `pnpm doc-sync` | 上游文档联动变化多，放到最后 |
| CI | 推送后等 GitHub Actions 绿 | 本地绿 ≠ CI 绿，两者都要 |

## 5.1 SDK 基线重建（每次升级固定动作）

学术 SDK 场景（`snapshots/sdk/academic-*`，共 9 个）回放的是**冻结**的 `session.v4.jsonl`，
断言的是**当前写入器**的输出。上游一旦改动写入器（工具集、system prompt 配置字段、事件形状、
传输投影），这 9 个场景就会在第一个对比点失败——这是设计如此，不是回归。

对比基线放在 `snapshots/sdk-oracles/`：`registry.json` 里每个场景一条 `active` 登记，
钉住 3 个必选文件（writer / prompt / tool-schemas）和 2 个可选文件（notifications / result，
仅该场景保留 wire 基线时）。所以"重建基线"是固定动作，不是临时救火：

```sh
# a. 确认 9 个场景都在册且为 active（缺一个就先补登记，别等失败）
node -e "const r=require('./snapshots/sdk-oracles/registry.json');for(const [k,v] of Object.entries(r.scenarios))console.log(k,v.status)"

# b. 逐个捕获到仓库外的一个空目录（record/refresh 对已登记场景是禁止的）
export DSH_SDK_ORACLE_CAPTURE_DIR=/tmp/sdk-capture/<scenario>
mkdir -p "$DSH_SDK_ORACLE_CAPTURE_DIR"
pnpm exec vitest run --config vitest.snapshot.config.ts -t '<scenario>'

# c. 人工 review 捕获产物：writer.raw.jsonl 与现有 writer.expected.jsonl 的差异，
#    prompt / schemas / notifications / result 是否只是预期内的格式演进

# d. 归一化后安装，并把新哈希写回 registry.json（五类文件各自钉一个 sha256）

# e. 重跑 9 个场景 + `pnpm typecheck`、`pnpm lint`、`pnpm duplication`、`pnpm doc-sync`
```

三条红线：

1. **冻结输入永不重写**。`session.v4.jsonl` 是回放输入，改它等于让测试自己证明自己。
2. **禁止改断言语义让测试通过**。发现断言写死了旧格式（例如写死 `str_replace_editor`、
   写死 `isError: false`），改的是断言对**当下的描述方式**，不是放宽判断标准。
3. **失败的捕获不能当基线**。只接受"能解释清楚的写入器演进"；解释不了就是真回归。

上一轮排雷中，9 个场景全红暴露出三类典型"单场景特例"债务，下次升级同样先查这三处：

- 回放用的 provider 关闭补丁只挂在了一个场景上，其余 7 个在无 key 环境直接失败；
- 场景补丁仍写上游已废弃的 `persona:` 字段，system prompt 静默变空；
- `sdk-minimal` 工具集已换成 `read_image` + `working_directory`，断言里还钉着旧工具。

共同点：**特例只覆盖一个场景**，其余场景没人跑过，于是没人发现。修法是"按规则泛化"
（按 composition 前缀匹配、按 registry 选场景），不是再补一个特例。

## 6. 冲突预算（用来判断什么时候必须重构）

每次升级记录四个数：

- 上游 SHA
- 冲突文件数 / 冲突 hunk 数
- 验收门通过情况
- 本次新增的 L2 文件数（新增即说明又在往上游源码里塞东西）

**冲突文件数连续两次上升 → 暂停加功能，先做一轮 L2→L1 降级。**

## 7. 与当前状态的衔接

1. **现在**：`upgrade/merge-upstream`（HEAD `a12031483d`）就是 0.2.1-rc.2 的接管分支。它在 master 的直线上，合入 `origin/master` 是快进——这是这套模型的第一次实例，只是缺"验收门全绿"这一步。
2. **待移植**：别名校验那两笔改动（已提交并推送到 `dev/zhouzhixian2021`，HEAD `1f2d5e067d`）要落到接管分支上，落点是：
   - 校验逻辑：`packages/academic/research-controller/src/research-brief-plan.ts`
   - 模型可见规则：`packages/bundle/web-app/presets/academic.patch.yml`（**不是**旧的 `agent.cordis.yml`）
   - 快照：`snapshots/sdk/academic-plan-chinese/system-prompt.expected.md`，**必须按新模板文案重记**
3. **之后**：把 `upgrade/<ver>` 的命名固定下来，下一个上游版本直接照第 4 节走。

## 8. 硬约定

- 不改写任何已发布分支的历史（master、master-new、dev/*）；
- 不触碰 `master-new`（其他成员的工作）；
- 同一个工作树同一时间只允许一个 agent 动手；
- 升级期间产生的所有原始命令与输出留在 `upgrade-prep-a`；
- 验收门红着不合入，宁可停下来记录缺口。
