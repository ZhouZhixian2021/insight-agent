# 开发记录：检索运行与 Web 投影接入

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-17 |
| 负责人 | 成员 A，`ZhouZhixian2021` |
| 协作输入 | 成员 B 的 `AcademicSourceSearchBatchResult` |
| 个人分支 | `dev/zhouzhixian2021` |
| 基线 | `master` 提交 `5633a9a` |

## 目标

在 A 所有的工作流和 Controller 中消费 B 的多来源批次，建立终态 `RetrievalRun` 与 `CoverageSummary`，并把固定 Web 样例对应的 `retrievalRun` 字段接入真实 Remote 返回，不修改 B 的 Provider 或 C 的页面。

## 完成内容

- `DraftPipelineAdapters.search` 改为消费 `AcademicSourceSearchBatchResult`，工作流使用 `batch.items` 摄取成果并保留 `batch.failures`。
- `selectResearchPapers()` 返回论文与实际观察到的纳入数量截断，避免根据数组长度猜测是否遗漏候选。
- 工作流在完成、失败和取消时生成 `RetrievalRun`，记录实际查询、Provider、去重成果、纳入成果、全文成功数、失败数、截断和限制。
- 来源失败与全文/抽取失败合并为 `ProviderFailure`；论文操作失败绑定 `affectedWorkVersionId`，且不复制原始异常文本。
- `AcademicResearchRunValue` 增加必有的 `retrievalRun`，Controller 原样返回 JSON 安全的共享运行记录。
- 报告限制同步披露来源失败、来源限制、检索截断和纳入数量上限；顶层完成状态、检索批次状态与报告质量保持独立。

## 检查结果

- Academic 工作流与 Controller 聚焦测试：4 个文件、101 个测试通过。
- Academic workflow 与 Controller TypeScript project build 通过。
- 双语 README、Academic 子系统说明与已实施 Agent Note 随源码更新。

## 下一步

1. C 将 Academic Web 从固定 JSON 夹具切换到 `ctx.remote.academicResearch.run` 的真实返回，并覆盖运行中、取消、部分成功、失败、限制、证据与报告质量状态。
2. A 在 C 合并后执行真实 Web 端到端验收，确认页面不从论文数组推断 Provider 或覆盖统计。
3. 多轮检索、自动重试、运行持久化、进度流、逐来源统计和长论文分段继续留在后续阶段。
