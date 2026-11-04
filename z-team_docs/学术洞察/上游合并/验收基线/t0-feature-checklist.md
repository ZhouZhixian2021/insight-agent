# T0 学术洞察功能对照清单

> 固定基线历史材料：T0 提交为 `bee2f554404a687e61c19175ea8a68c52fb4451a`。本文件于 2026-11-03 从 `upgrade-prep-a` 移入，表中行为、路径及限制按当时基线理解。当前入口见 [上游合并资料](../00-目录.md)。

范围只覆盖固定 T0 中可定位的实现和验收材料。表中测试入口说明已有覆盖对象，不表示本次已经运行或验收通过。所有仓库路径均相对于 `D:/code/insight/insight-agent-baseline-t0`。

查当前代码请使用[学术洞察代码导航](../../01-代码导航.md)。F01 中旧预设目录是 T0 原位置；当前模式配置在 [academic.patch.yml](../../../../packages/academic/bundle/presets/academic.patch.yml)，技能在 [academic/skills](../../../../packages/academic/bundle/presets/academic/skills/)。这里保留旧基线原路径，不将当前布局误记为 T0 的布局。

| 编号 | 功能 | 升级后需要保持的行为 | T0 检查入口 |
| --- | --- | --- | --- |
| F01 | 启动与装配 | 启动正确项目，学术预设可选择，模型配置和插件依赖可用；运行数据隔离。 | `scripts/start-insight-web.ps1`、`packages/preset/agent-presets/presets/academic/`、`packages/bundle/web-app/`；按手工启动步骤验证。 |
| F02 | 共享模型与身份 | 论文、版本、Brief、证据及运行身份保持关联；缺失值和审核状态保持明确。 | `packages/academic/model/tests/works.spec.ts`、`research-brief.spec.ts`、`evidence.spec.ts`、`query-workflow.spec.ts`。 |
| F03 | 计划与批准 | 中文计划可审查、修改和批准；执行采用批准版本、查询、范围与预算，普通追问不误触发研究。 | `packages/academic/research-controller/tests/plan-validation.spec.ts`、`controller.host.spec.ts`；`snapshots/sdk/academic-plan-chinese/`、`academic-plan-validation/`。 |
| F04 | 多来源与混合检索 | 学术源与 Web 按批准策略执行，Web 引用核验后入库；失败与空结果分别披露。 | `packages/academic/workflow/tests/hybrid-search.spec.ts`；`packages/academic/research-controller/tests/hybrid-retrieval-contract.spec.ts`；`packages/academic/source-*/tests/provider.spec.ts`。 |
| F05 | 摄取与去重 | 保留规范成果、版本与查询来源，精确身份归并后仍能追溯；论文数与版本数分开。 | `packages/academic/ingestion/tests/ingest.spec.ts`、`packages/academic/workflow/tests/progress.spec.ts`。 |
| F06 | 候选审核与排序 | 按批准规则初筛、语义审核、评分及 P0/P1/P2 排队；候选问题匹配不冒充证据覆盖。 | `packages/academic/retrieval/tests/{parse-semantic-review,select-reviews,rank}.spec.ts`；`packages/academic/research-controller/tests/candidate-review-handoff.spec.ts`；八篇评分包。 |
| F07 | 分批调度与补检 | 论文处理上限和研究覆盖目标分开，保留停止原因和已结算批次；恢复不重复完成的检索或审核。 | `packages/academic/workflow/tests/{candidate-batches,replenishment,recovery}.spec.ts`；`packages/academic/research-controller/tests/controller.host.spec.ts`。 |
| F08 | 全文与证据 | HTML/PDF 解析保留定位；逐字核验；失败范围恢复不丢已验证证据；零证据停止报告合成。 | `packages/academic/evidence/tests/{fetched-fulltext,fetched-pdf,fragments,minimal}.spec.ts`；`packages/academic/workflow/tests/{pe1-handoff,pe4-integration}.spec.ts`。 |
| F09 | 分析与报告 | 逐题分析、方向级 Markdown、引用及证据关联仍可追溯；有限草稿和正式质量分开；无证据不补造答案。 | `packages/academic/analysis/tests/synthesis.spec.ts`；`packages/academic/report/tests/{directions,minimal,delivery,retrieval-disclosure}.spec.ts`；`packages/academic/workflow/tests/pe4-integration.spec.ts`。 |
| F10 | 后台运行与页面 | 断开查看不取消研究，显式取消保留事实；刷新/重启后按支持范围查询；进度、覆盖、报告质量分别展示。 | `packages/academic/research-controller/tests/{background-run,progress-contract,q6-projection}.spec.ts`；`packages/academic/ui-research/tests/{progress,run-panel,q6-live}.client.spec.tsx`。 |
| F11 | 所选论文二级增强 | 对已有一级证据的一篇论文增强，保留原草稿；新增证据、失败及取消独立持久化和展示。 | `packages/academic/research-controller/tests/controller.host.spec.ts`；`packages/academic/ui-research/tests/enhancement.client.spec.tsx`。 |

## 保留的能力限制

- 批次级恢复与片段级重启续跑不同。T0 的真实记录未证明片段级重启续跑可用，不把该目标写成已完成能力。
- 三题跨模块验收使用脚本化来源和模型响应。它验证交接和失败保留，不能证明真实论文的相关性或结论语义正确。
- 八篇评分包保存历史模型审核和确定性重放条件，不包含完整发现池或全文证据覆盖；全文地址可解析性不保证当前下载成功。
- T0 已有内部 HTML 渲染辅助函数与 Markdown 下载。C 的新增 HTML 报告交付仍按独立 PR 和验收记录登记，不把“已有内部 HTML”视为新功能已完成。
- 真实记录中的报告仍有 `needs_review`、问题覆盖不足、正文过短及模型超时/输出不完整等限制。升级对照先区分旧缺陷与新增回归，不以运行结束代替质量通过。

行为依据以 T0 的 `docs/subsystems/academic-insight.zh.md`、各包 README 和测试为准。原始样本清单和运行结果仍在本机 `upgrade-prep-a/samples-manifest.json`、`upgrade-prep-a/results.json` 存档，本次未将原始日志和会话材料迁入共享库；本文件不代表一次新的验收通过记录。
