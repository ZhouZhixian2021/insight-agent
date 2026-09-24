# 开发记录：B-H3 精确归并与 Web 核验溯源

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-24 |
| 负责人 | 成员 B，`Yzyhello` |
| 协作人员 | 无 |
| 个人分支 | `dev/yzyhello` |
| 任务分支 | `dev/yzyhello-b-h3` |
| 提交 | 与本记录同批提交，提交号以 Git 历史为准 |
| 远程状态 | 从任务分支向 `master` 提交 PR；审核与合并状态以 GitHub 为准 |

## 目标

让已核验的 Web 论文与直接学术搜索结果按共享 DOI、arXiv ID 或带 Provider 命名空间的官方记录 ID 精确归并，同时保留 Web 发现 URL、核验 Provider 和各论文版本。没有精确依据的相似记录只标记为疑似重复。

## 实际完成

- [混合检索执行器](../../packages/academic/workflow/src/hybrid-search.ts)对重复引用只核验一次，并把每个发现 URL 与核验 Provider 随官方记录交给摄取；候选上限应用于去重后的成果数，同一成果的不同版本继续保留。
- [摄取库](../../packages/academic/ingestion/src/index.ts)在重复版本合并时保留新增精确标识符、来源记录及 Web 核验轨迹，并将轨迹关联到最终成果 ID 与版本 ID。官方 `provider_record` 标识带 Provider 命名空间；模糊标题、作者和年份只触发疑似重复审计。
- [回归测试](../../packages/academic/workflow/tests/hybrid-search.spec.ts)覆盖无 DOI 的 ACL 官方记录、同一引用的多个发现 URL、跨渠道 DOI 归并与不同版本保留；[摄取测试](../../packages/academic/ingestion/tests/ingest.spec.ts)覆盖重放后新核验 DOI 仍可桥接其他来源。
- 同步维护 source、ingestion、workflow 的中英文 README、学术子系统说明、Agent Notes、双语配对记录及生成的 Cordis API 目录。

## 实际检查

- 四个相关测试文件共 142 项通过；Host 和 Client TypeScript 检查、全仓 lint、`pnpm run build`、`git diff --check` 通过。
- `pnpm run gen-cordis-catalog` 更新接口目录；随后 `pnpm run doc-sync` 的 33 项全部通过。
- 全库 1183 组翻译配对及文档预算检查通过。未运行需要真实学术来源凭据的 e2e；此次合并与溯源测试使用官方记录规范化结果和无网络适配器。
- `pnpm run hygiene` 的 16 项中 14 项通过。Windows 工作区以 `core.symlinks=false` 签出符号链接，ACP `cordis.yml` 因此成为普通文本，导致配置检查失败；本机创建目录符号链接返回 `EPERM`，导致 NodeNext 全包检查无法运行。改为直接导入三个修改包的构建声明执行 NodeNext TypeScript 检查，结果通过；未将完整 hygiene 写成通过。

## 风险与限制

- 只有共享已核验标识或官方记录明确携带的对应标识才自动归并。不同来源的论文没有这些精确依据时，即使标题相似也保持独立。
- Controller 仍未接入第 3 版计划的混合执行器；Web 界面尚不能运行该路径。B-H3 的记录和归并能力可供 A-H3b/A-H4 接入。
- 完整 hygiene 的两项 Windows 符号链接限制需由 PR 的 CI 环境复核；本地无法据此宣称该检查通过。

## 下一步

- 成员 A 接入已批准的 Academic 与 Web 操作并投影混合检索观察值；成员 B 按 [团队计划](../模块分工/academic-hybrid-retrieval-team-plan.md#b-h4失败与证据保护)继续 B-H4。
