# 多来源研究运行交接说明

## 状态与范围

| 项目 | 内容 |
|---|---|
| 负责人 | A 维护交接规则，B、C 分别实现自己的模块 |
| 基线 | B 的多来源批次已合并至 `master` 提交 `5633a9a` |
| 状态 | B 的来源批次与 A 的工作流/Remote 接口已实现；C 接入真实返回 |
| 范围 | 多来源部分成功、覆盖统计、Remote 返回值与主 Web 展示 |

本交接复用 `BatchResult<T>`、`ProviderFailure`、`CoverageSummary` 和 `RetrievalRun`，不建立新的失败分类、覆盖统计或运行状态体系。B 生产来源事实，A 汇总工作流事实，C 展示浏览器安全结果。

## B：多来源搜索批次

B 在 `academic-source` 中为 `searchAll()` 增加以下结果信息。字段名和嵌套关系由本轮固定，`AcademicSourceWork` 继续属于来源包，批处理和失败类型继续来自 `academic-model`。

```ts
interface AcademicSourceSearchBatchResult {
  readonly providers: readonly string[]
  readonly discoveredRecords: number
  readonly batch: BatchResult<AcademicSourceWork>
  readonly truncated: boolean
  readonly limitations: readonly string[]
}
```

字段含义：

- `providers` 包含所有实际发起搜索的可用 Provider，包括成功返回零条和执行失败的 Provider；按 Provider ID 确定排序并去重。
- `discoveredRecords` 是应用聚合总上限前各 Provider 返回记录数的总和，不根据最终保留数量推测。
- `batch.items` 保留成功的规范化成果；`batch.failures` 保留来源级失败。两者同时存在时状态为 `partial_success`。
- `truncated` 只表示 Provider 或聚合服务因数量上限丢弃了记录。
- `limitations` 记录来源自身的覆盖限制，例如只搜索配置的会议或论文集目录；它不重复逐项错误消息。

行为要求：

| 情况 | 结果 |
|---|---|
| 所有 Provider 成功，即使零结果 | `batch.status: success` |
| 部分 Provider 失败，至少一个成功结果 | 保留成功项并返回 `partial_success` |
| 所有已调用 Provider 都失败 | 返回 `failed` 和全部失败，不抛弃失败明细 |
| 没有可用 Provider、配置无效或重复注册 | 继续抛出配置错误，不包装成批次失败 |
| 用户取消 | 中止整轮，不创建误导性的 ProviderFailure |

B 负责把可预期的网络、限流、超时、上游和解析错误转换为不含凭据的 `ProviderFailure`。搜索级失败不填写 `affectedWorkVersionId`。B 不生成 `RetrievalRun` 或 `CoverageSummary`，也不修改工作流、Controller 或 C 的页面。

固定输入输出见 [`b-multi-source-search-batch.sample.json`](../interface-samples/academic-model-v1/b-multi-source-search-batch.sample.json)。B 的验收至少覆盖零结果成功、单源失败部分成功、全部来源失败、取消和聚合上限。

## C：Web 运行结果

C 按 `AcademicResearchRunValue` 的正式字段开发主 Web。返回值包含必有的 `retrievalRun`；其字段与共享 `RetrievalRun` 一致并保持 JSON 安全。C 不从 `papers` 推断 Provider、失败数量或覆盖范围。

```ts
interface AcademicResearchRunValue {
  readonly sessionId: SessionId
  readonly status: 'completed' | 'cancelled'
  readonly retrievalRun: RetrievalRun
  readonly papers: readonly AcademicPaperResultView[]
  readonly failures: readonly PaperProcessingFailureView[]
  readonly report: AcademicResearchReportView | null
}
```

页面使用以下状态语义：

- Remote Promise 未结算时只能显示“研究运行中”和取消操作；当前接口没有服务器进度百分比或阶段流。
- `status: cancelled` 表示用户或 Session 取消；保留已经返回的论文结果，`report` 为 `null`。
- `retrievalRun.status: partial_success` 表示部分来源或论文操作失败，但仍有成果进入分析；页面显示限制和失败，不把整轮标成完全失败。
- `retrievalRun.status: failed` 表示没有成功纳入成果且存在失败；页面仍展示失败列表和覆盖信息。
- `report.evaluation.status` 独立表示报告质量。`completed` 或检索 `success` 都不等于人工审核通过。
- `coverageSummary.providerBreakdown` 为 `null`；页面不得渲染虚构的逐来源计数。

固定 Remote 返回见 [`c-academic-research-run.sample.json`](../interface-samples/academic-model-v1/c-academic-research-run.sample.json)。C 使用该样例完成运行中、完成、取消、部分成功、失败、报告质量、证据和限制展示，再切换到 `ctx.remote.academicResearch.run` 的真实返回。C 不修改 `academic-model`、`academic-source`、`academic-workflow` 或 Controller 类型；接口差异交给 A 处理。

## A：运行汇总与 Remote 投影

A 的工作流直接消费 B 的 `batch.items`、`batch.failures`、Provider、发现数量、截断与限制，构造终态 `RetrievalRun` 和 `CoverageSummary`。来源失败与全文或抽取失败进入统一运行失败列表，Controller 在 `AcademicResearchRunValue` 中返回 JSON 安全的 `retrievalRun`。正式接口测试覆盖成功、部分成功、全部来源失败、论文操作失败、截断与取消。

A 不在本轮加入多轮搜索、自动重试、持久恢复、进度流、逐来源统计或长论文分段。C 完成页面后，A 使用真实 Remote 返回组织最终 Web 验收。

返回[学术洞察模块总览](academic-module-ownership.md)。
