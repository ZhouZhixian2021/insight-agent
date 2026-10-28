# 成员 C：固定研究材料与本地对比

本工具在真实研究完成后导出 Session 中已经保存的阶段材料，并离线重放 C 的报告、评测和独立页面。不会启动 Harness、联网检索、获取全文或调用模型。文件保存在 `.artifacts/academic-experiments/`，该目录已被 Git 忽略；不要把真实会话材料默认加入 PR。

## 本次固定样本

- 主题：图像分类数据增强中 Mixup 与 CutMix 的做法、效果与适用场景比较。
- Session：`session-74a20485-649a-4b7a-937b-b24b738fda30`。
- 研究运行：`aac89fe9-99d5-44bf-a79c-9fd419f95ead`。
- 基准目录：`.artifacts/academic-experiments/mixup-cutmix-2026-10-26-v1/`。
- `frozen/` 是固定输入与原始结果；`baseline/` 是当前 C 模块的离线重放结果。实验另建目录，不能覆盖固定包。

## 导出一次已经完成的研究

在仓库根目录运行，Session 文件路径和运行 ID 从对应研究记录取得：

```powershell
pnpm exec tsx --tsconfig tsconfig.base.json scripts/academic-experiment.ts export --session ".dsh-runtime/sessions/--E-agent--/session-74a20485-649a-4b7a-937b-b24b738fda30/session.v2.jsonl.zstd" --run "aac89fe9-99d5-44bf-a79c-9fd419f95ead" --output ".artifacts/academic-experiments/my-case/frozen"
```

`--html` 可选，用于复制已有 HTML 下载文件；工具会核对其中的证据 ID。输出目录必须不存在。没有完成报告、没有对应模型结果、Session 尾部未写完整或读取期间文件变化时拒绝完成导出，原 Session 不修改。

固定包包含研究计划、候选筛选与排序、论文版本来源、全文处理事实、证据记录与证据卡、分析输入与解析输出、模型原始可见回答、分析调用配置与提示、重建的报告输入、原始报告及评测、检索运行、阶段进度、Trace、C 源码快照和文件哈希。所有阶段材料来自实际记录；恢复检查点中的候选与证据不是重新搜索的结果。

## 修改报告、评测或独立页面

先生成基线，再修改 C 的代码，使用相同固定包另存实验：

```powershell
$bundle = ".artifacts/academic-experiments/mixup-cutmix-2026-10-26-v1/frozen"
pnpm exec tsx --tsconfig tsconfig.base.json scripts/academic-experiment.ts replay --bundle $bundle --output ".artifacts/academic-experiments/my-case/baseline"
# 修改 C 模块后运行，--compare 指向上面的基线目录。
pnpm exec tsx --tsconfig tsconfig.base.json scripts/academic-experiment.ts replay --bundle $bundle --output ".artifacts/academic-experiments/my-case/report-v2" --compare ".artifacts/academic-experiments/my-case/baseline"
```

命令直接使用工作区源码，修改这些 C 源码后不要求全仓打包。每次输出包括 `报告.md`、`报告.json`、`评测结果.json`、`页面预览.html`、`汇总.json`、`对比.json`、`实验记录.json` 和 `代码快照.json`。默认与原始报告比较，也可用 `--compare` 比较上一版本。汇总忽略随机评测 ID，比较报告状态、结论、引用证据、交付问题、内容限制和 Markdown；运行记录另外保存报告评测及独立页面生成耗时。

相同输入重放两遍，应没有内容差异。固定包哈希不符时拒绝运行，避免把材料变化误认为代码改善。评测时间固定为原运行时间；这不是按当前日期重新核查文献更新。自动差异没有判断哪一版更好，仍需检查是否更好读、引用是否保留、逐题是否回答。

## 修改分析提示或材料组织

```powershell
pnpm exec tsx --tsconfig tsconfig.base.json scripts/academic-experiment.ts prepare-analysis --bundle $bundle --output ".artifacts/academic-experiments/my-case/prompt-v2"
```

该命令保存当前分析提示和原分析输入，不会获得新模型回答。测试提示效果需要在同一模型及生成参数下，通过团队已有受记录的模型调用入口执行分析，保留实际返回 JSON，再导入：

```powershell
pnpm exec tsx --tsconfig tsconfig.base.json scripts/academic-experiment.ts replay --bundle $bundle --response "新模型回答.json" --output ".artifacts/academic-experiments/my-case/analysis-v2" --compare ".artifacts/academic-experiments/my-case/baseline"
```

模型本身仍有波动，重要效果需要少量重复比较；单次输出不能证明改进。本工具不新增在线分析入口，不绕过 A 的模型预算和 Session 记录。

## 已知边界

原始分析输入和模型可见输出可以直接恢复。报告调用参数未完整作为独立事件保存，因此报告输入由已保存材料重建：保留原 Claim ID，重新建立关联，沿用原报告限制，检索披露从原 Markdown 恢复。实验说明明确标注这种区别；对本次样本已用内容对比验证重放一致，不能推断所有历史记录都完全一致。

原始 PDF/HTML 字节未被本工具自动恢复；保存的全文处理事实、来源、内容哈希及已记录提示中的片段不等于一份原始全文归档。原研究的精确代码版本未记录则标为未知，不以导出时的 Git 版本冒充。导出和实验会保存 C 模块实际源码，包括未提交修改。

本轮不增加网页按钮或自动导出，也不替代主 Web 的交互、正式 HTML 导出、真实模型和端到端验收。`页面预览.html` 使用现有独立页面渲染器；原始正式 HTML 如提供，会单独保留。

## 比较两种写作方案

compare-writing 读取同一固定分析输入，使用两份另行撰写的 JSON，分别采用任务模板和开源思路；不是完整开源项目安装，也不自动调用 Provider。产物为实验草稿，正文与表格都保留证据关联。两版共享固定上游输入，最终选用的证据集合可以不同；未知 Evidence ID 和表格列数错误会拒绝生成。引用有效不等于语义正确，仍需阅读判断。

```powershell
pnpm exec tsx --tsconfig tsconfig.base.json scripts/academic-experiment.ts compare-writing --bundle ".artifacts/academic-experiments/mixup-cutmix-2026-10-26-v1/frozen" --variant-a ".artifacts/academic-experiments/mixup-cutmix-writing-2026-10-28/A-任务模板写作输入.json" --variant-b ".artifacts/academic-experiments/mixup-cutmix-writing-2026-10-28/B-开源思路写作输入.json" --output ".artifacts/academic-experiments/mixup-cutmix-writing-2026-10-28/results-repeat"
```

这次提供的两份写作 JSON 由当前 Codex 对话模型根据完整固定证据撰写；提示文件是后续可复用的规范，不冒充 DeepSeek 实际调用记录。该实验可比较结构和表达，不能证明同一 DeepSeek 模型在相同参数下有性能提升。产物包括 Markdown、保留证据的 JSON、提示、共同分析输入和实验记录；正式 HTML 使用现有客户端导出器另行生成。

A 采用核心结论、方法表、效果与条件表、选用边界和局限；B 采用问题导向的连贯段落、独立章节职责和精简结果表。两者保留相同的证据、实验数值及适用限制。原始论文缺失不作为本轮优化目标，生产 Harness 报告流程没有切换到任一方案。

## 真实 DeepSeek 写作对照记录

2026-10-28 的真实实验位于 .artifacts/academic-experiments/mixup-cutmix-deepseek-2026-10-28/。它通过本地 c-writing-experiment DSH profile 挂载私有实验驱动，复用已有 LLM、凭据和 Session 服务及已记录的模型配置，只调用写作，不运行检索、全文获取或证据抽取。未读取或复制凭据文件到实验包，也未修改生产 Web profile。独立 Session 保存实际请求与结果；原研究 Session 保持原样。

两版源分析输入逐字节一致，实际派发均为 hw-2012 / deepseek-v4.1-flash / maxTokens 32768，各一次调用。temperature 和其他未记录参数保持未指定，无法保证远端后台版本或随机输出完全一致。A/B 的输入 token 差异来自写作指令，不来自上游材料变化；最终引用集合和正文是实验结果，不能强行固定。

A 版有一条 Evidence ID 拼写错误，影响一个段落和一行表格。程序保留原始返回并隔离相关内容，不自动猜测正确编号；B 版采用相同检查与渲染规则。检查只保证已引用 ID 和已有材料关联，不建立语义审核。JSON 校验成功与后续引用检查分别记录，原调用记录不被改写。

实跑报告目录保存 HTML、Markdown、JSON、原始模型可见输出、实际提示、请求配置、调用耗时与 usage、引用拒绝记录、统一后处理代码快照以及 Session 只读核对结果。每版只有一次样本，适合查看输出差异，尚不是统计意义上的优劣证明。当前私有 profile 指向已完成的实验路径，旧路径禁止覆盖；下一次实验需另建输出和驱动配置，不直接重跑覆盖旧结果。
