# 开发记录：阶段一 B 学术元数据与候选初筛修复

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-09 |
| 负责人 | B（yzyhello） |
| 协作人员 | 无 |
| 个人分支 | `dev/yzyhello` |
| 任务分支 | 无（直接在个人分支上交付） |
| 提交 | 本记录与阶段一 B 修复同批提交 |
| 远程状态 | 记录编写时未推送；交付目标为个人分支到 `master` 的 Draft PR，实时状态见 GitHub |

## 目标

保留候选论文指定版本的学术摘要和关键词，为候选排序提供可复现的内容初筛。初筛根据审核过的主题、问题、方法和证据词项生成判断，避免用发现查询数量或问题覆盖广度代替主题相关性。

## 实际完成

- [Academic Source](../../packages/academic/source/src/types.ts) 和 [IngestRecord](../../packages/academic/ingestion/src/types.ts) 携带可选学术元数据，摘要和关键词使用明确的可用状态，缺失值保留原因。
- arXiv 保留 Atom 摘要和学科分类；OpenAlex 重建倒排摘要、读取关键词，并拒绝重复、缺位或非法位置。ACL、PMLR、CVF 从官方论文页的引用字段和各站摘要块读取元数据，稀疏目录记录仍保持未知。
- [摄取归并](../../packages/academic/ingestion/src/metadata.ts) 按版本保留首份可用摘要并合并关键词；读取指定版本时不借用其他版本或 Web 发现摘要。
- [候选初筛](../../packages/academic/retrieval/src/assess.ts) 新增 `assessPlannedCandidates()`，接受明确审核过的概念组、多语言别名、贡献信号、参考年份、时效窗口及规范版本全文事实，输出可交给现有排序器的 `CandidateAssessment`。主题分采用主题或单个问题的最高命中比例，问题匹配要求全部概念命中；方法和证据潜力独立计算，自然语言纳入／排除规则保持未知。
- 来源质量分只表示书目信息完整度。排序权重和阈值继续由[共享排序策略](../../.agents/notes/implemented/architecture/2026-09-29-academic-query-planning-candidate-ranking-contract.zh.md)负责。
- 补齐来源解析、元数据缺失与非法输入、版本隔离、专门研究单个问题、无关候选和中英文词项的回归测试；更新八个包及学术来源子系统的双语说明、配对记录与生成 API 目录，新增[决策记录](../../.agents/notes/implemented/architecture/2026-10-09-academic-scholarly-metadata-screening.zh.md)。

## 实际检查

- `pnpm exec vitest run packages/academic/ingestion/tests packages/academic/retrieval/tests packages/academic/source/tests packages/academic/source-arxiv/tests packages/academic/source-openalex/tests packages/academic/source-acl/tests packages/academic/source-pmlr/tests packages/academic/source-cvf/tests`：14 个文件、233 项测试通过。
- `pnpm run lint`：通过，包含 Host TypeScript 编译、tsdown 打包和完整 oxlint。
- 构建导出 smoke：普通 Node 成功导入 `metadataForVersion()`、`assessPlannedCandidates()` 和来源规范化函数；规范化、摄取后读回摘要的断言通过。
- `pnpm run verify-translation-pairing -- <本次 11 组文档>`：通过；范围包含八个包 README、学术来源子系统和两份 Agent Note。
- `pnpm run test:docs`：14/15，通过项不代表整组通过；唯一失败为当前 `master` 已有的 `docs/persistence-catalog.md` 配对记录不一致。
- `pnpm run doc-sync`：30/33。失败涉及持久化目录配对、`approvedPaperAdapters()` 的 `gapRoundPolicy`／`onPlan` 参数缺少 JSDoc，以及 Controller 缺口补检配置未同步到配置目录。本次补写子系统文档时的临时配对差异已由后续 11 组定向配对检查修正；上述主分支问题仍保留。
- `pnpm run test:snapshot -- -t cordis-inspect-jsdoc`：源码模式两次均在 30 秒子进程启动期限内未退出；使用 `DSH_EXAMPLE_MODE=lib` 诊断时，缺少本机 `fs-ext` 的 `build/Release/fs_ext.node`，启动失败。未修改快照、超时或断言，不能宣称回放通过。
- `git diff --check`：通过。
- 未运行全仓库覆盖率和真实网络／模型 e2e。

## 风险与限制

- 词项匹配不理解否定表述，也不验证方法有效性、科学价值或最终问题覆盖；初筛结果仍需全文证据验证。
- Controller 仍需提供审核词项和按 `WorkVersionId` 索引的全文事实，接入初筛结果并记录 Session 事件；本次未完成该消费方集成。
- 本次不改变已发布 Session JSONL 格式；来源目录缺失摘要时，需官方核验取得元数据后才能补齐。
- 真实网络来源、模型调用和整轮研究效果需独立联调验收。

## 下一步

- A 接入候选初筛并完成 Session 记录，沿用现有排序器和分批调度。
- A、B、C 使用固定研究任务联合验收候选相关性与全文证据产量；具体时间待分配。
