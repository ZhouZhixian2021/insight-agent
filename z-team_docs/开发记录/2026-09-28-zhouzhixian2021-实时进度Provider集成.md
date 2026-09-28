# 2026-09-28 学术研究实时进度 Provider 集成

## 目标

成员 B 已在 Academic Source 和 Ingestion 包中发布 Provider 生命周期事实与摄取审计汇总。本次由成员 A 把这些事实接入学术研究工作流，使成员 C 已完成的实时页面能够收到真实来源状态和统一摄取计数。

## 已完成

1. `DraftPipelineAdapters.search()` 新增可选 Provider 观察者参数。该参数属于单次查询调用，不保存为跨运行共享状态。
2. Academic Controller 的历史纯学术检索和混合检索都把观察者传给 `AcademicSourceRuntime.searchAll()` 或 `searchProviders()`。
3. 工作流为每个 Provider 的 `started` 和 `settled` 事实补充查询序号、查询总数以及工作流时钟，并发布 `provider_updated` 快照。
4. Provider 成功、失败和取消分别映射为 `success`、`failed` 和 `cancelled` 活动；失败保留 B 提供的分类，取消使用 `cancelled`，零结果仍属于成功。
5. Provider 活动使用“查询序号 + Provider”作为运行内键，不会与其他查询中的同名 Provider 相互覆盖。
6. 工作流删除本地摄取审计统计实现，直接使用 Ingestion 包的 `summarizeIngestAudit()`，四项计数只有一个解释来源。
7. 聚焦测试覆盖 Provider 成功、失败、取消、观察顺序以及 Controller 向 Academic Source 的转发。
8. 工作流双语说明、实时进度架构记录和团队计划同步更新。

## 当前调用链

```text
Academic Source Provider
  -> AcademicSourceProviderObserver
  -> Academic Controller 搜索适配器
  -> DraftPipelineAdapters.search
  -> academic-workflow ProgressPublisher
  -> academicResearch.runStream
  -> 学术研究 Web 页面
```

摄取计数调用链：

```text
ingestWorks()
  -> summarizeIngestAudit()
  -> AcademicWorkflowProgressCounts
  -> academicResearch.runStream
  -> 学术研究 Web 页面
```

## 验证结果

- `pnpm exec vitest run packages/academic/workflow/tests/progress.spec.ts packages/api/academic-research-controller/tests/search.spec.ts`：12 项测试通过。
- `pnpm run typecheck`：通过。

## 仍待完成

1. Web 发现、引用识别和逐条核验目前只有终态混合检索观察，尚未发布运行中的活动。
2. 证据抽取的分段序号、总分段数、模型尝试次数、最大尝试次数和等待重试状态仍未接入，相关字段继续保持 `null`。
3. 四项摄取计数已经进入实时快照，但页面是否全部展示仍需成员 C 在联合验收时确认。
4. 完成上述两类细粒度事实后，需要使用真实学术源和真实模型执行一次端到端人工验收。

## 主要文件

- `packages/academic/workflow/src/pipeline-types.ts`
- `packages/academic/workflow/src/pipeline.ts`
- `packages/academic/workflow/tests/progress.spec.ts`
- `packages/api/academic-research-controller/src/search.ts`
- `packages/api/academic-research-controller/tests/search.spec.ts`
- `packages/academic/workflow/README.md`
- `packages/academic/workflow/README.zh.md`
- `.agents/notes/implemented/architecture/2026-09-28-academic-research-progress-snapshots.md`
- `.agents/notes/implemented/architecture/2026-09-28-academic-research-progress-snapshots.zh.md`
- `z-team_docs/模块分工/academic-research-live-progress-team-plan.md`
