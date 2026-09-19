# 开发记录：Academic 双查询验收

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-18 |
| 负责人 | 成员 A，`ZhouZhixian2021` |
| 协作人员 | 成员 B、成员 C |
| 个人分支 | `dev/zhouzhixian2021` |
| 任务分支 | 无 |
| 提交 | 待提交 |
| 远程状态 | 本地未推送 |

## 目标

为已合并的有界明确查询编排建立一套三人共用的真实 Web 端到端验收基线，固定研究需求、两条查询、计划审批条件、结果判断和失败归属，避免把运行完成、检索成功、证据充分和人工审核通过混为同一状态。

## 实际完成

- 确认 PR #27 的合并提交 `7b82b29` 与 PR #28 的合并提交 `ee1cab5` 已进入远程 `master`，本地 `master` 与 `dev/zhouzhixian2021` 均同步到 `ee1cab5`。
- 在[成员 A 调用与交接计划](../模块分工/member-a-academic-workflow-call-plan.md#真实双查询端到端验收基线)中固定 Transformer 与 BERT 的研究需求、2017—2020 年范围和两条英文检索查询。
- 固定 Brief 审核要求：两轮检索、最多五篇候选、最终两篇全文、中文草稿和明确证据限制。
- 把验收拆成“流水线接线通过”和“研究内容通过”两级；明确未经过独立语义审核的草稿可以被评测为 `needs_review` 或 `blocked`，不能据此误判 Remote 执行失败。
- 登记 A、B、C 以及联调环境的失败归属，后续使用同一运行结果分派修复。
- 对照固定基线完成 A 侧后端自检。现有测试覆盖换行查询解析与精确重复项删除、查询顺序、第一轮来源失败后继续、批次轮转、跨查询去重、全局候选上限、批准轮数上限、取消时只记录已开始查询，以及来源失败与覆盖统计汇总；未发现需要新增的 A 侧源码修改。
- 重新构建并启动本地 Web，在已批准 Research Brief 的同一 Session 中输入两条固定查询，完成一次真实端到端运行。
- 验收结论为“流水线接线通过、研究内容未通过”：页面收到结构化结果，两条查询按顺序执行，来源失败没有阻止下一条查询，失败与限制完整展示；但没有论文取得全文，报告被正确标记为“阻止交付”。

## 实际检查

- 已通过 Git 历史确认远程 `master` 的 PR #27 合并提交包含 `d9f8a8a`。
- PR #28 合并后，Academic Web 入口已改为多行输入，显示“一行一条查询，最多三条”，且实际请求保留了两条查询之间的换行。旧构建产物仍显示单行输入，执行全量构建并重启 Web 后恢复为当前实现。
- 固定 Session 为 `session-eb3bd987-1cb3-4149-b8fd-009d127df013`。计划模型在批准前曾给出非法工作类型、错误检索轮数、摘要降级和不存在的 `insufficientEvidencePolicy` 枚举；经人工两次退回后，最终计划满足固定 Brief，说明计划审核仍是必要门禁。
- 真实运行按顺序执行两条固定查询，并明确返回“2 ordered search queries without automatic retries”。实际调用来源为 `acl`、`arxiv`、`cvf`、`pmlr`。
- 运行终态为“已完成”，检索结果为“失败”，报告质量为“阻止交付”。覆盖统计为：发现记录 10、去重后论文 5、实际纳入 0、可用全文 0、仅摘要 0、仅元数据 0、失败操作 6。
- 六条失败记录与 `failedOperations: 6` 一致：ACL 和 PMLR 在两条查询中各发生两次 `search/upstream_error`；arXiv 两篇候选各发生一次 `fetch_fulltext/fulltext_unavailable`。页面继续展示来源覆盖限制、候选上限、论文处理失败以及报告质量问题，没有把运行完成误写为审核通过。
- 当前页面同时显示“去重后论文 5”和“候选上限保留 10 篇去重论文中的 5 篇”。这暴露出 A 侧 `deduplicatedWorks` 使用限额后的保留数量，而限制说明使用限额前去重数量的口径差异；不影响本次接线结论。A 随后把该字段统一为各查询实际返回记录经过跨查询去重、但尚未应用本轮全局候选上限时的数量；`academicWorkIds` 继续保存上限内保留的候选，并用候选上限测试固定两者差异。
- 统计修复后，工作流、Controller 与 Web 展示的 3 个聚焦测试文件共 91 个测试通过；仓库类型检查、Academic workflow 聚焦 lint 和 1173 组双语配对检查通过。
- `pnpm run test:docs` 首次在受限运行环境读取 Windows 用户信息时因 `uv_os_get_passwd` 返回 `ENOMEM`，未进入项目门禁；使用相同命令在宿主环境重跑后 15 项全部通过。
- `pnpm exec vitest run packages/academic/workflow/tests/pipeline.spec.ts packages/academic/workflow/tests/selection.spec.ts packages/api/academic-research-controller/tests/controller.host.spec.ts` 未找到 Windows 命令入口，测试没有启动；改用仓库已安装的 `node_modules/.bin/vitest.cmd` 执行同一组用例后，3 个测试文件、82 个测试全部通过。
- `git diff --check` 与新增记录的行尾检查通过。

## 风险与限制

- 真实联网联调已经执行，但只通过接线验收，没有通过研究内容验收。
- C 的多行输入、运行状态和失败展示已经通过本次验收；后续主要依赖 B 排查 ACL/PMLR 联网失败及 arXiv 全文获取失败，并确认 2017—2020 目标目录覆盖。
- `deduplicatedWorks` 的限额前后统计口径问题已由 A 修正；需要重新构建并复验页面，确认同类运行显示“去重后论文 10”和“保留 5 篇候选”。
- 当前流程不包含自动查询生成、自动重试、长论文分段抽取、持久恢复或独立语义审核。

## 下一步

- A 已统一 `deduplicatedWorks` 的统计口径并补充回归测试；不改 B、C 的模块接口。合并前重新构建 Web 并确认页面使用新统计。
- B 排查 ACL/PMLR 的 `fetch failed`、两篇 arXiv 候选的全文获取失败，并验证 2017—2020 代表论文目录覆盖。
- C 当前无需为本次结果修改页面；在 A 调整统计口径后仅需确认现有标签仍与接口语义一致。
- B 修复进入 `master` 后，A 使用同一 Brief 和同两条查询复验研究内容是否达到 2 篇全文、2 篇纳入及可追溯中文草稿。

## 2026-09-19 OpenAlex 接线复验

- A 在 Web 正式组合中挂载 B 已合并的 OpenAlex Provider，把 `searchAll()` 的发现来源明确配置为 `openalex` 与 `arxiv`，并为每个来源设置 25000 ms 搜索时限。ACL、CVF 与 PMLR 继续注册，供已知记录的全文地址解析使用，但不参与本次发现检索。
- 未对 OpenAlex 设置发表年份过滤。OpenAlex 的聚合发表日期不能替代 `first_public_release`，严格日期筛选继续要求权威来源补齐首发日期。
- OpenAlex 组合、来源服务、工作流和 Controller 的 4 个聚焦测试文件共 113 项通过；全仓库类型检查和完整 Web 构建通过。`verify-cordis-config` 唯一失败仍是 Windows 将 `apps/cli/tests/profiles/acp/cordis.yml` 的 Git 符号链接检出为普通文本，与本次 Academic 配置无关。
- 使用原 Session `session-eb3bd987-1cb3-4149-b8fd-009d127df013`、原批准 Brief 和原两条查询完成真实 Web 复验。终态为运行完成、检索成功、报告阻止交付；实际来源为 `arxiv, openalex`，发现记录 20、跨查询去重后论文 10、全局候选上限保留 5、实际纳入 0、可用全文 0、失败操作 0。
- 本次确认 A 的 Remote、双查询、来源聚合、去重统计、报告评测和 C 的 Web 投影已经完整串联。研究内容仍未通过：宽查询没有保证目标代表论文进入前五；每条查询的多来源聚合上限与整轮全局候选上限都会截断候选。OpenAlex 独有记录的 `first_public_release` 仍未知，不能绕过严格范围门禁。
- 下一步需由 A 与用户确认查询编排策略。可选方向是继续要求人工输入精确标题或 arXiv ID，或增加由批准 Brief 导出的明确查询；不得在 Provider 内硬编码论文，也不得把 OpenAlex 发表日期冒充首次公开日期。

## 2026-09-19 精确编号与全文路径复验

- 用户确认第一版以精确 arXiv 编号 `1706.03762` 与 `1810.04805` 继续验证，不在本轮增加自动查询规划。
- 未调整 Web 抓取限制时，两篇论文都进入全文阶段，但 arXiv HTML 在默认 100000 字符上限处被截断，证据准备按完整性规则拒绝截断正文；PDF 兜底又在默认 30000 ms 内超时。页面只显示通用的 `fulltext_unavailable`，没有暴露底层截断或超时原因。
- 使用仓库内置 `HttpFetchProvider` 直接复核后，`120000 ms` 与 `1000000` 字符配置能够完整处理两篇论文：Transformer 解析 67 段、25566 个正文字符，BERT 解析 114 段、44629 个正文字符，两者均生成内容哈希。A 因此在 Web 正式组合中固定相同抓取预算；不修改 B 的 HTML/PDF 解析逻辑。
- 实际合成配置显示，本机安装的 `dsh-web-tools` 又把通用 `ctx.web.fetch` 选择改为 `dsh-web-tools-fetch`。该 Provider 将 HTML 转成 `text`，并拒绝 PDF；B 的 Academic 证据准备只接受未截断 HTML 或 PDF，因此正式 Academic Controller 通过通用默认 Provider 调用时与该插件不兼容。一次性验收覆盖把学术全文切回 `http` 后，不再使用该第三方 fetch Provider；临时覆盖未纳入仓库。
- 一次性覆盖下连续两轮运行仍在全文前结束：arXiv 的两条搜索均返回 `TypeError: fetch failed`，OpenAlex 也出现一次网络失败或超时。仓库内置 HTTP 抓取器在同一环境可以通过 DSH 代理取得两篇 arXiv 全文，而 arXiv 与 OpenAlex 搜索 Provider 当前直接使用 Node `fetch`。因此本轮无法完成证据抽取与报告内容验收，阻塞点归为 B 的来源网络出口；不是 C 的页面问题，也不是 B 的全文解析算法失败。
- 后续由 B 让 arXiv 与 OpenAlex 搜索遵循 DSH 的代理出口并保持现有失败分类；由 A 另行确认 Academic Controller 如何明确选择可返回原始 HTML/PDF 的全文 Provider，避免第三方通用 fetch 选择改变学术输入格式。C 无需针对本次结果改页面。
