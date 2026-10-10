# 开发记录：B-P0 候选评估与偏题过滤

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-10 |
| 负责人 | B（yzyhello） |
| 协作人员 | A（共享评估接口与后续接线） |
| 个人分支 | `dev/yzyhello` |
| 任务分支 | 无（直接使用个人分支） |
| 提交 | 见本 PR 的提交历史 |
| 远程状态 | Draft PR，待覆盖率与文档检查收敛 |

## 目标

落实[总体计划中的 P0 候选评估交接](../模块分工/academic-hybrid-retrieval-team-plan.md)：区分论文内容支持与检索来源路由，为方法、证据类型、贡献和研究问题匹配提供可核对的原文线索，并让纯排序器在全文获取前处理经过审核的明确偏题判断。

## 实际完成

- [候选评估函数](../../packages/academic/retrieval/src/assess.ts)返回必带 `screening` 的 `DetailedCandidateAssessment`。词项线索只取自规范标题与学术 Provider 摘要；完整的问题和贡献匹配落在同一份原文来源中。仅关键词命中记录为 `surfaceKeywordHits`，不增加问题、方法、证据或贡献信号。
- 新增[外部审核解析器](../../packages/academic/retrieval/src/parse-screening.ts)，检查完整 JSON、字段、版本、已批准研究问题以及逐字引文。评估函数可接收按 `AcademicWorkId` 索引的外部审核结果；方法和证据标签必须对应已批准概念，重复线索不会重复计分。
- [排序器](../../packages/academic/retrieval/src/rank.ts)直接对照 Q3 保留的规范元数据核验引文，拒绝缺少对应原文线索的详细评分；附有原文引文的 `off_topic` 判断进入硬过滤。`unknown` 和摘要缺失本身不会触发偏题硬过滤；发现来源不增加问题匹配分。
- [固定测试](../../packages/academic/retrieval/tests/rank.spec.ts)覆盖相关论文进入 P0、跨语言审核、仅关键词命中、标题与摘要碎片拼接、代码生成／图像生成／安全攻击偏题、当前 Plan 下相关的安全研究，以及伪造引文。保留旧版无 `screening` 的评估输入兼容性。
- 新增[SDK 会话快照](../../snapshots/sdk/academic-candidate-screening/session.v2.jsonl)：相关论文进入 P0；经过审核的代码生成偏题论文被排除；缺少摘要但标题相关的论文保持 `unknown` 并进入 P1 候选队列。这里的 P1 是候选优先级，与团队的 P1 开发任务不同。
- 更新[包文档](../../packages/academic/retrieval/README.zh.md)与[原有决策记录](../../.agents/notes/implemented/architecture/2026-10-09-academic-scholarly-metadata-screening.zh.md)及其英文、配对记录。本轮没有修改 Controller 或证据抽取实现。

## 实际检查

- `pnpm exec vitest run packages/academic/retrieval/tests/rank.spec.ts packages/academic/retrieval/tests/parse-screening.spec.ts packages/api/academic-research-controller/tests/candidate-screening.spec.ts packages/api/academic-research-controller/tests/q6-projection.spec.ts`：4 文件、53 测试通过。
- `node node_modules/vitest/vitest.mjs run packages/academic/retrieval/tests/rank.spec.ts`：最后修正后的 21 测试通过，包含对照 Q3 规范摘要拒绝伪造评估摘要的检查。
- `pnpm run build:lib:host`：通过；`node node_modules/typescript/bin/tsc -b packages/academic/retrieval/tsconfig.json`：通过。
- `pnpm run lint:contracts-ready`：修正两处非空断言后通过。新增快照后，`node --import tsx/esm scripts/run-oxlint.ts snapshots/sdk/academic-candidate-screening/fixture.ts snapshots/sdk/sdk.snapshot.ts packages/academic/retrieval/src packages/academic/retrieval/tests`：通过。
- `DSH_SNAPSHOT=refresh` 下使用 `node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts -t academic-candidate-screening` 更新输出，再以相同命令进行无写入回放：1 场景通过。环境变量由 PowerShell 在更新进程内设置，回放进程未设置该变量。
- `node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts scripts/session-snapshot-corpus.corpus.ts`：3 测试通过。
- `node --import tsx/esm scripts/verify-translation-pairing.ts packages/academic/retrieval/README.md .agents/notes/implemented/architecture/2026-10-09-academic-scholarly-metadata-screening.md`：两对文件一致；`git diff --check`：通过。
- `pnpm run doc-sync`：31 项通过、2 项失败，分别为 Cordis API 生成目录过期、[配置目录英文文档](../../docs/config-catalog.md)与配对记录不同步。未将整个文档检查写为通过；具体失败保留在 PR 中说明。
- 对变更源文件运行定向覆盖率：53 测试通过，覆盖率门槛未通过；`assess.ts` 为 98.33% 语句／96.33% 分支，`rank.ts` 为 88.57% 语句／82.23% 分支，新解析器为 100%。这项检查尚待补齐后重跑。
- Markdown 链接、换行、NodeNext 导入检查通过；`publint-all` 退出码为 0，retrieval 包检查为 `All good!`。
- 部分 `pnpm` 启动命令曾在执行工具前报 `RetryOperation` 的 `message` 属性异常；对应类型与测试检查改为直接调用本地安装工具并通过，未绕过行为失败或 Git 钩子。

## 风险与限制

- 默认词项判断不能理解否定或完整语义，范围保持 `unknown`。明确偏题过滤需要外部审核结果；引文核验只能证明文字来源，不能证明审核解释正确。
- B 已交付解析、提示要求、固定样例与纯排序器；模型适配、Session 请求／结果记录、配置和 Controller 接线仍由 A 负责。接线前不能宣称真实运行已经减少偏题全文获取。
- 固定样例是合成元数据，本轮未对此前真实运行的同一候选集复验，也未进行完整真实研究运行。
- B 的 P1 证据抽取稳定性任务尚未实施。现有分批和重试代码仅完成阅读检查，没有作为本轮改动提交。

## 下一步

- A：按[包文档中的审核输入与输出要求](../../packages/academic/retrieval/README.zh.md)提供当前 Plan、规范标题／摘要及已批准概念，将解析后的审核结果传入评估函数，并完成配置、Session 记录和 Controller 接线。
- A／B：使用同一组真实候选复验排名、偏题排除理由、全文进入数量和阶段耗时，记录与词项初筛的差异。
- B：下一轮再开展团队 P1 证据抽取稳定性开发，包括失败片段缩小、局部恢复、阶段输出额度与并发调整；本 PR 不包含该任务。
