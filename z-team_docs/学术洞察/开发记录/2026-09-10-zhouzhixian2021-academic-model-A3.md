# Academic Model A3 开发记录

## 基本信息

- 日期：2026-09-10
- 负责人：成员 A（ZhouZhixian2021）
- 分支：`dev/zhouzhixian2021`
- 范围：实现带版本、人工审核和执行资格判断的 Research Brief。

## 已完成

1. 新增 `ResearchBrief`，保存研究主题、别名、研究问题、纳入排除规则、目标读者和明确假设。
2. 新增 `PublicationWindow`，分别保存可空的起止日期及 `published`、`first_public_release` 两种日期依据。
3. 新增 `EvidenceRequirements`，保存最低纳入论文数、最低全文数、最低证据层级、证据可定位要求、预印本规则和证据不足处理方式。
4. 新增 `ReportRequirements` 与 `ReportTargetLength`，保存报告语言、篇幅、必备章节、引用方式和附录类要求。
5. 新增 `StopConditions`，保存检索轮数、候选数量、纳入数量、运行时间、饱和轮次和满足证据要求后的提前停止规则。
6. 新增 `BriefApproval`，严格区分 `pending`、`approved` 和 `revision_requested`。
7. 新增 `isExecutableResearchBrief()`。只有 `approvedBriefVersion` 与 Brief 当前 `version` 完全一致时才允许执行。
8. 新增随机 `ResearchBriefId` 创建函数，同一次研究目标的不同 Brief 版本复用同一个 ID。
8. 新增 `createResearchBriefId()`，为同一研究目标的全部 Brief 版本创建共用随机内部 ID。

## 字段含义

- `researchBriefId`：同一次研究目标跨版本共用的稳定 ID。
- `version`：Brief 内容版本；研究范围、问题、证据要求或输出要求发生实质变化时创建新版本。
- `publicationWindow.start/end`：`null` 表示该方向不限制；有值时保留日期原始精度。
- `publicationWindow.dateBasis`：`first_public_release` 按首次公开时间纳入预印本，`published` 按正式发表时间筛选。
- `minimumEvidenceLevel`：只允许 `abstract` 或 `fulltext`，元数据不能支持实质性学术结论。
- `insufficientEvidencePolicy`：`continue_with_warning` 允许带明确不足继续，`stop_for_review` 要求暂停并交给人工处理。
- `requiredSections`、`includedWorkTypes` 和篇幅 `unit`：保持为用户批准的字符串，不把当前样例值误设为不可扩展枚举。
- `maximumElapsedMinutes`：`null` 表示不以时间作为停止上限。
- `approval`：当前 Brief 版本的审核结果；历史版本与审核记录由后续 Session 持久化阶段保留。

## 执行规则

- `pending` 不允许执行。
- `revision_requested` 不允许执行。
- `approved` 但批准版本早于当前 Brief 版本时不允许执行。
- 只有当前版本获得明确批准时，`isExecutableResearchBrief()` 才返回 `true`。
- 普通追问是否构成 Brief 实质修改由上层计划工作流判断，本纯模型包不修改会话或自动进入 Plan Mode。

## 文件范围

- `packages/academic/model/src/types.ts`
- `packages/academic/model/src/research-brief.ts`
- `packages/academic/model/src/index.ts`
- `packages/academic/model/tests/research-brief.spec.ts`
- `packages/academic/model/README.md`
- `packages/academic/model/README.zh.md`
- `.agents/notes/implemented/architecture/2026-09-10-academic-model-package.md`
- `.agents/notes/implemented/architecture/2026-09-10-academic-model-package.zh.md`
- `docs/subsystems/academic-insight.md`
- `docs/subsystems/academic-insight.zh.md`

## 当前状态

- A3 已进入本地工作区，尚未提交或推送。

## 验证结果

- Academic Model 聚焦测试：通过，3 个测试文件共 7 个测试。
- `pnpm exec tsc -b packages/academic/model --force`：通过。
- `pnpm exec tsx scripts/run-oxlint.ts packages/academic/model`：通过；首次检查发现的联合类型缩进已经修正。
- 本次包 README、子系统说明和 Agent Note 的双语配对检查：通过。
- `pnpm exec vitest run scripts/doc-standard.spec.ts`：单独复跑通过，12 个测试。此前与其他检查并发执行时发生一次 5 秒超时，不属于断言失败。
- `git diff --check`：通过。
- `pnpm run test:docs`：15 项门禁中 14 项通过，只有仓库既有的双语配对欠账失败；A3 更新的三组文档均未出现在失败清单中。

本阶段继续更新已有 Academic Model Agent Note，没有创建重复决策记录；同主题搜索未发现需要归档或合并的其他活动 Agent Note。
