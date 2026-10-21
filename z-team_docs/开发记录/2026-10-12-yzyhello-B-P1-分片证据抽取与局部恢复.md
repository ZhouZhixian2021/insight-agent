# 开发记录：B-P1 分片证据抽取与局部恢复

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-10 开始，2026-10-12 继续完成本地验证 |
| 负责人 | B（yzyhello） |
| 协作人员 | A（模型、Session、配置与正式工作流接线） |
| 个人分支 | `dev/yzyhello` |
| 提交 | 见本轮 P1 PR 的提交历史 |
| 远程状态 | 独立 P1 Draft PR；P0 的 PR #77 已合并 |

## 目标

完成[总体计划中 B 的 P1 抽取任务](../模块分工/academic-hybrid-retrieval-team-plan.md)：将成功片段逐个核验并交付保存，只恢复失败原文范围，保留精确定位和有界尝试次数。B 交付库与固定场景；模型执行、Session 持久化、生产额度和论文总并发接线由 A 完成。

## 实际完成

- 新增[分片抽取函数](../../packages/academic/evidence/src/fragments.ts)与[类型](../../packages/academic/evidence/src/fragment-types.ts)，不修改既有单篇抽取函数或 Controller。所有片段沿用现有逐字引文核验；摘要字符偏移对应原始文本，全文保留段落／页码定位。
- 初始片段大小、最小恢复大小、重叠、总尝试次数、抽取输出额度和传输退避均由调用方显式提供。每个初始片段的尝试预算包含它的恢复子片段；纯空白片段不发送、不消耗调用次数。
- 每个成功片段在后续发送前等待 `onVerified` 完成。保存失败直接停止，不分类为模型错误，也不触发重试。已保存的证据不因同篇后续失败或取消被清空；最终组装保留证据及卡片条目身份，并对重叠的相同证据去重。
- 超时、解析失败和输出不完整只缩小失败范围；无法继续缩小时在剩余预算内重试当前范围。传输失败只重发当前范围并按显式延迟指数退避。未分类错误和外部取消仍拒绝调用。
- 失败事实包含论文／版本、初始片段编号、原始片段与字符范围、抽取阶段、尝试次数、输出额度、分类和原始错误。原始错误中的 Provider 请求 ID 不被丢弃。连续超时／传输次数在成功核验后清零，供 A 调整总并发；观察者抛错不改变抽取结果。
- 新增[无密钥 SDK 会话快照](../../snapshots/sdk/academic-evidence-fragments/session.v2.jsonl)，固定“第一片段已经保存 → 第二片段超时 → 只拆分第二片段 → 最终保留三条证据”的可复现流程。
- 更新[包文档](../../packages/academic/evidence/README.zh.md)、[原有决策记录](../../.agents/notes/implemented/architecture/2026-09-11-academic-evidence-construction.zh.md)、子系统说明及其英文和配对记录。

## 实际检查

- `node node_modules/vitest/vitest.mjs run packages/academic/evidence/tests/fragments.spec.ts packages/academic/evidence/tests/extract.spec.ts --coverage --coverage.include=packages/academic/evidence/src/fragments.ts`：2 文件、34 测试通过；新实现的语句、分支、函数和行覆盖率均为 100%。这不是全仓库覆盖率结果。
- `pnpm run build:lib:host`：通过；`pnpm exec publint packages/academic/evidence`：`All good!`。
- `node --import tsx/esm scripts/run-oxlint.ts packages/academic/evidence/src/fragments.ts packages/academic/evidence/src/fragment-types.ts packages/academic/evidence/tests/fragments.spec.ts snapshots/sdk/academic-evidence-fragments/fixture.ts snapshots/sdk/sdk.snapshot.ts`：通过。此前整仓 `pnpm run lint:contracts-ready` 也通过；最终新增空白片段处理已重新执行定向检查。
- 使用 `DSH_SNAPSHOT=refresh` 生成新场景，再不设置该变量运行 `node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts -t academic-evidence-fragments`：只读回放通过。
- `node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts scripts/session-snapshot-corpus.corpus.ts`：3 测试通过。
- `pnpm run test:docs`：14 项通过、1 项失败，失败为既有 `docs/config-catalog.md` 配对记录不同步。
- `pnpm run doc-sync`：30 项通过、3 项失败。Cordis API 生成目录过期及 `docs/config-catalog.md` 配对不同步与上轮相同；另有文档标准测试在并行检查中触发 5 秒超时。检查结束后以相同 `pnpm exec vitest run scripts/doc-standard.spec.ts` 单独复核：12/12 通过。文档总检查仍记录为失败，不以单独通过覆盖总检查结果。
- 本轮三对双语文件的定向配对检查通过；开发记录的相对链接检查与 `git diff --check` 通过。

## A 接线要求

1. 用新的分片 API 替代该路径的整篇等待；生成器一次调用只执行一次模型尝试，关闭嵌套的旧分批／重试，避免调用预算相乘。
2. 在模型调用前应用 `maximumOutputTokens`，分别保留抽取和合成额度；逐次记录完整请求、论文与原始字符范围。将可恢复的超时、传输、解析和不完整输出映射到 B 的四种分类，持久化失败和取消不参与恢复。
3. `onVerified` 完成后必须代表证据保存成功；把失败事实映射到现有运行日志与进度，并从原始错误／Provider 结果中保留可取得的请求 ID。被拒草稿序号是回调对应片段的局部序号，需与回调中的原始范围一起保存。
4. 用连续失败事实临时降低论文总并发，并用成功核验事实恢复计数。阈值、生产片段大小和阶段额度需同一真实论文集复验后配置；测试中的 8 字符与 512 token 仅是边界夹具。

## 风险与限制

- 本轮是 B 库的实现与验证，正式工作流尚未调用新 API。生产阶段输出额度、自动降低论文并发和逐片段 Session 保存尚未由 A 接入，不能宣称真实研究运行已改善。
- 已有成功片段跨取消／失败保留依赖调用方实现持久保存。库自身不写 Session、不新增持久化格式，也不提供跨运行恢复。
- 固定场景使用合成文本，尚未用相同真实论文集复验有效证据、耗时或生产额度；没有运行付费模型或完整真实研究。
- 文档总检查的既存失败仍需对应负责人收敛；本轮没有修改生成目录或配置文档来掩盖失败。
