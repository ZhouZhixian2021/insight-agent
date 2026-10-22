# B 逐项迁入清单（文件级）

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-21 |
| 负责人 | yzyhello（B） |
| 对应路线 | `upgrade/port-academic`（从 U0 起步迁入 T0 学术能力） |
| 迁入基线 T0 | 团队 `origin/master` 的固定提交，取值见[分工方案](academic-upstream-upgrade-dual-route-team-plan.md)「固定版本与分支」 |
| 目标基线 U0 | 标签 `dsh-v0.2.1-rc.2` 指向的提交，取值同上 |
| 工作目录 | `D:\agent-project\insight-agent-u0` |
| 方法 | 只读 `git ls-tree`／`git log`／`git grep`；未联网、未改源码 |
| 覆盖 | 学术入口 342 个文件；必要基座修改候选 33 个文件 |
| 性质 | 迁入计划与来源登记，不代表任何文件已迁入或已通过验证 |

本文是[上游升级双路线与持续开发分工](academic-upstream-upgrade-dual-route-team-plan.md)第零轮要求的逐项迁入清单正式版，细化[U0 增量登记与迁入清单](../开发记录/2026-10-21-yzyhello-B-U0-增量登记与迁入清单.md)的文件级范围，并关闭其第六节待查项。

## 一、待查项结论

三项在 U0 均已不存在，且学术入口均未引用，不影响迁入范围。

| 待查项 | U0 现状 | 证据 | 迁入动作 |
| --- | --- | --- | --- |
| `packages/runtime-diagnostics/invariants`（`@deepseek-ai/dsh-invariants`） | 整体移除，含各包 `./invariant` 子路径导出 | `docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants/guide.md`；U0 `packages/` 无 `runtime-diagnostics` 组；`packages/extensions/tool-cordis/src/api-catalog.ts` 中原 T0 的 `invariants` 条目在 U0 已不存在 | 不迁入；基座文件（`api-catalog.ts`、bundle 装配）取 U0 版本，不保留 invariants 行或依赖 |
| `packages/code-runtime/`（`code-runtime`、`code-runtime-worker-thread`） | 无该包组；T0 web-app 装配中的 `code-runtime` 行与依赖已消失 | T0 `packages/bundle/web-app/cordis.patch.yml:60`、`package.json` 列有该行；U0 对应文件不再包含；U0 提供 `packages/ptc-runtime` 与 `packages/experimental/webworker-runtime`、`packages/experimental/ptc-runtime-python` 承担并发执行能力 | 不迁入；装配以 U0 版本为准，只叠加学术行 |
| `packages/e2b/`（`e2b`、`fs-e2b`、`subprocess-e2b` 等） | 无该包组，也没有功能性引用（仅存 i18n 配对文件与历史升级指南提及） | `git grep -i e2b HEAD -- packages` 无源码或依赖命中 | 不迁入 |

学术入口（`packages/academic/**`、`packages/api/academic-research-controller/**`、`packages/client/ui-academic-research/**`、`packages/preset/agent-presets/presets/academic/**`）对上述三项的引用为空，已用 `git grep -E "dsh-invariants|dsh-e2b|dsh-code-runtime|/invariant'"` 在 T0 上核验。

## 二、迁入文件清单（文件级）

迁入版本一律取自 T0 树；启用 T0 之前逐文件的最后修改提交时，用下面两条命令按 `<T0>` 还原，不需要在本文硬编码提交标识：

```sh
git ls-tree -r --name-only <T0> -- packages/academic packages/api/academic-research-controller packages/client/ui-academic-research packages/preset/agent-presets/presets/academic
git log --format='@@%h|%ad' --date=short --name-only <T0> -- packages/academic packages/api/academic-research-controller packages/client/ui-academic-research packages/preset/agent-presets/presets/academic
```

下表按包登记文件与类别，并给出该包最后修改时间的跨度，用于判断迁入时的改动新旧。T0 之后进入团队主线的唯一非文档增量是 `packages/api/academic-research-controller/tests/candidate-pool-handoff.spec.ts`（提交主题「补齐完整候选池筛选与送审交接」），迁入 Controller 时一并补齐（该目录 T0 为 31 个文件，团队 master 为 32 个）。

### packages/academic/（学术包组，14 子包 + 组级文件）


#### packages/academic/（组级文件）

| 文件 | 类别 |
| --- | --- |
| `packages/academic/README.i18n.yaml` | 配置与文档 |
| `packages/academic/README.md` | 配置与文档 |
| `packages/academic/README.zh.md` | 配置与文档 |

小计：3 个文件；最后修改时间跨度 2026-09-30 ~ 2026-09-30。

#### packages/academic/analysis/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/analysis/README.i18n.yaml` | 配置与文档 |
| `packages/academic/analysis/README.md` | 配置与文档 |
| `packages/academic/analysis/README.zh.md` | 配置与文档 |
| `packages/academic/analysis/package.json` | 配置与文档 |
| `packages/academic/analysis/src/analyze.ts` | 实现 |
| `packages/academic/analysis/src/evidence-reading.ts` | 实现 |
| `packages/academic/analysis/src/index.ts` | 实现 |
| `packages/academic/analysis/src/prepare.ts` | 实现 |
| `packages/academic/analysis/src/report-format.ts` | 实现 |
| `packages/academic/analysis/src/synthesis-input.ts` | 实现 |
| `packages/academic/analysis/src/synthesis-parse.ts` | 实现 |
| `packages/academic/analysis/src/synthesis-types.ts` | 实现 |
| `packages/academic/analysis/src/synthesis.ts` | 实现 |
| `packages/academic/analysis/src/types.ts` | 实现 |
| `packages/academic/analysis/tests/analyze.spec.ts` | 测试 |
| `packages/academic/analysis/tests/direction-layout.spec.ts` | 测试 |
| `packages/academic/analysis/tests/evidence-reading.spec.ts` | 测试 |
| `packages/academic/analysis/tests/fixtures.ts` | 测试 |
| `packages/academic/analysis/tests/minimal.spec.ts` | 测试 |
| `packages/academic/analysis/tests/prepare.spec.ts` | 测试 |
| `packages/academic/analysis/tests/synthesis.spec.ts` | 测试 |
| `packages/academic/analysis/tsconfig.json` | 配置与文档 |
| `packages/academic/analysis/tsconfig.tests.json` | 配置与文档 |

小计：23 个文件；最后修改时间跨度 2026-09-14 ~ 2026-10-15。

#### packages/academic/eval/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/eval/README.i18n.yaml` | 配置与文档 |
| `packages/academic/eval/README.md` | 配置与文档 |
| `packages/academic/eval/README.zh.md` | 配置与文档 |
| `packages/academic/eval/package.json` | 配置与文档 |
| `packages/academic/eval/src/admission.ts` | 实现 |
| `packages/academic/eval/src/index.ts` | 实现 |
| `packages/academic/eval/tests/admission.spec.ts` | 测试 |
| `packages/academic/eval/tests/evaluate.spec.ts` | 测试 |
| `packages/academic/eval/tests/semantic-cases.json` | 测试 |
| `packages/academic/eval/tests/semantic-review.spec.ts` | 测试 |
| `packages/academic/eval/tsconfig.json` | 配置与文档 |

小计：11 个文件；最后修改时间跨度 2026-09-15 ~ 2026-10-12。

#### packages/academic/evidence/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/evidence/README.i18n.yaml` | 配置与文档 |
| `packages/academic/evidence/README.md` | 配置与文档 |
| `packages/academic/evidence/README.zh.md` | 配置与文档 |
| `packages/academic/evidence/package.json` | 配置与文档 |
| `packages/academic/evidence/src/card.ts` | 实现 |
| `packages/academic/evidence/src/enhance.ts` | 实现 |
| `packages/academic/evidence/src/extract.ts` | 实现 |
| `packages/academic/evidence/src/fetch-fulltext.ts` | 实现 |
| `packages/academic/evidence/src/fetched-fulltext.ts` | 实现 |
| `packages/academic/evidence/src/fetched-pdf.ts` | 实现 |
| `packages/academic/evidence/src/fragment-types.ts` | 实现 |
| `packages/academic/evidence/src/fragments.ts` | 实现 |
| `packages/academic/evidence/src/index.ts` | 实现 |
| `packages/academic/evidence/src/locator.ts` | 实现 |
| `packages/academic/evidence/src/record.ts` | 实现 |
| `packages/academic/evidence/src/types.ts` | 实现 |
| `packages/academic/evidence/tests/enhance.spec.ts` | 测试 |
| `packages/academic/evidence/tests/evidence.spec.ts` | 测试 |
| `packages/academic/evidence/tests/extract.spec.ts` | 测试 |
| `packages/academic/evidence/tests/fetch-fulltext.spec.ts` | 测试 |
| `packages/academic/evidence/tests/fetched-fulltext.spec.ts` | 测试 |
| `packages/academic/evidence/tests/fetched-pdf.spec.ts` | 测试 |
| `packages/academic/evidence/tests/fragments.spec.ts` | 测试 |
| `packages/academic/evidence/tests/minimal.spec.ts` | 测试 |
| `packages/academic/evidence/tests/optimization.spec.ts` | 测试 |
| `packages/academic/evidence/tsconfig.json` | 配置与文档 |

小计：26 个文件；最后修改时间跨度 2026-09-11 ~ 2026-10-15。

#### packages/academic/ingestion/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/ingestion/README.i18n.yaml` | 配置与文档 |
| `packages/academic/ingestion/README.md` | 配置与文档 |
| `packages/academic/ingestion/README.zh.md` | 配置与文档 |
| `packages/academic/ingestion/package.json` | 配置与文档 |
| `packages/academic/ingestion/src/dedup.ts` | 实现 |
| `packages/academic/ingestion/src/index.ts` | 实现 |
| `packages/academic/ingestion/src/merge.ts` | 实现 |
| `packages/academic/ingestion/src/metadata.ts` | 实现 |
| `packages/academic/ingestion/src/types.ts` | 实现 |
| `packages/academic/ingestion/tests/ingest.spec.ts` | 测试 |
| `packages/academic/ingestion/tsconfig.json` | 配置与文档 |

小计：11 个文件；最后修改时间跨度 2026-09-11 ~ 2026-10-09。

#### packages/academic/model/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/model/README.i18n.yaml` | 配置与文档 |
| `packages/academic/model/README.md` | 配置与文档 |
| `packages/academic/model/README.zh.md` | 配置与文档 |
| `packages/academic/model/package.json` | 配置与文档 |
| `packages/academic/model/src/availability.ts` | 实现 |
| `packages/academic/model/src/claim-freshness.ts` | 实现 |
| `packages/academic/model/src/claims.ts` | 实现 |
| `packages/academic/model/src/external-identifiers.ts` | 实现 |
| `packages/academic/model/src/ids.ts` | 实现 |
| `packages/academic/model/src/index.ts` | 实现 |
| `packages/academic/model/src/query-workflow.ts` | 实现 |
| `packages/academic/model/src/research-brief.ts` | 实现 |
| `packages/academic/model/src/results.ts` | 实现 |
| `packages/academic/model/src/retrieval.ts` | 实现 |
| `packages/academic/model/src/types.ts` | 实现 |
| `packages/academic/model/tests/availability.spec.ts` | 测试 |
| `packages/academic/model/tests/claim-samples.spec.ts` | 测试 |
| `packages/academic/model/tests/claims.spec.ts` | 测试 |
| `packages/academic/model/tests/evidence.spec.ts` | 测试 |
| `packages/academic/model/tests/query-workflow.spec.ts` | 测试 |
| `packages/academic/model/tests/research-brief.spec.ts` | 测试 |
| `packages/academic/model/tests/results.spec.ts` | 测试 |
| `packages/academic/model/tests/retrieval.spec.ts` | 测试 |
| `packages/academic/model/tests/works.spec.ts` | 测试 |
| `packages/academic/model/tsconfig.json` | 配置与文档 |

小计：25 个文件；最后修改时间跨度 2026-09-10 ~ 2026-10-20。

#### packages/academic/report/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/report/README.i18n.yaml` | 配置与文档 |
| `packages/academic/report/README.md` | 配置与文档 |
| `packages/academic/report/README.zh.md` | 配置与文档 |
| `packages/academic/report/package.json` | 配置与文档 |
| `packages/academic/report/src/bibliography.ts` | 实现 |
| `packages/academic/report/src/direction-render.ts` | 实现 |
| `packages/academic/report/src/index.ts` | 实现 |
| `packages/academic/report/src/markdown.ts` | 实现 |
| `packages/academic/report/src/question-evidence.ts` | 实现 |
| `packages/academic/report/src/retrieval-disclosure.ts` | 实现 |
| `packages/academic/report/src/synthesis-render.ts` | 实现 |
| `packages/academic/report/tests/benchmark.ts` | 测试 |
| `packages/academic/report/tests/delivery.spec.ts` | 测试 |
| `packages/academic/report/tests/directions.spec.ts` | 测试 |
| `packages/academic/report/tests/expected/direction-report.md` | 测试 |
| `packages/academic/report/tests/expected/minimal-report.md` | 测试 |
| `packages/academic/report/tests/expected/question-report.md` | 测试 |
| `packages/academic/report/tests/minimal.spec.ts` | 测试 |
| `packages/academic/report/tests/pipeline.spec.ts` | 测试 |
| `packages/academic/report/tests/retrieval-disclosure.spec.ts` | 测试 |
| `packages/academic/report/tests/synthesis.spec.ts` | 测试 |
| `packages/academic/report/tsconfig.json` | 配置与文档 |

小计：22 个文件；最后修改时间跨度 2026-09-15 ~ 2026-10-19。

#### packages/academic/retrieval/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/retrieval/README.i18n.yaml` | 配置与文档 |
| `packages/academic/retrieval/README.md` | 配置与文档 |
| `packages/academic/retrieval/README.zh.md` | 配置与文档 |
| `packages/academic/retrieval/package.json` | 配置与文档 |
| `packages/academic/retrieval/src/assess.ts` | 实现 |
| `packages/academic/retrieval/src/execute.ts` | 实现 |
| `packages/academic/retrieval/src/index.ts` | 实现 |
| `packages/academic/retrieval/src/metadata-quotes.ts` | 实现 |
| `packages/academic/retrieval/src/parse-screening.ts` | 实现 |
| `packages/academic/retrieval/src/parse-semantic-review.ts` | 实现 |
| `packages/academic/retrieval/src/planner.ts` | 实现 |
| `packages/academic/retrieval/src/rank.ts` | 实现 |
| `packages/academic/retrieval/src/select-reviews.ts` | 实现 |
| `packages/academic/retrieval/src/semantic-screening.ts` | 实现 |
| `packages/academic/retrieval/tests/parse-screening.spec.ts` | 测试 |
| `packages/academic/retrieval/tests/parse-semantic-review.spec.ts` | 测试 |
| `packages/academic/retrieval/tests/rank.spec.ts` | 测试 |
| `packages/academic/retrieval/tests/retrieval.spec.ts` | 测试 |
| `packages/academic/retrieval/tests/select-reviews.spec.ts` | 测试 |
| `packages/academic/retrieval/tsconfig.json` | 配置与文档 |

小计：20 个文件；最后修改时间跨度 2026-09-30 ~ 2026-10-20。

#### packages/academic/source/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/source/README.i18n.yaml` | 配置与文档 |
| `packages/academic/source/README.md` | 配置与文档 |
| `packages/academic/source/README.zh.md` | 配置与文档 |
| `packages/academic/source/package.json` | 配置与文档 |
| `packages/academic/source/src/catalog.ts` | 实现 |
| `packages/academic/source/src/identify-reference.ts` | 实现 |
| `packages/academic/source/src/index.ts` | 实现 |
| `packages/academic/source/src/types.ts` | 实现 |
| `packages/academic/source/tests/catalog.spec.ts` | 测试 |
| `packages/academic/source/tests/identify-reference.spec.ts` | 测试 |
| `packages/academic/source/tests/paper-citation.spec.ts` | 测试 |
| `packages/academic/source/tests/source.spec.ts` | 测试 |
| `packages/academic/source/tsconfig.json` | 配置与文档 |

小计：13 个文件；最后修改时间跨度 2026-09-11 ~ 2026-10-09。

#### packages/academic/source-acl/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/source-acl/README.i18n.yaml` | 配置与文档 |
| `packages/academic/source-acl/README.md` | 配置与文档 |
| `packages/academic/source-acl/README.zh.md` | 配置与文档 |
| `packages/academic/source-acl/package.json` | 配置与文档 |
| `packages/academic/source-acl/src/index.ts` | 实现 |
| `packages/academic/source-acl/src/parse.ts` | 实现 |
| `packages/academic/source-acl/src/provider.ts` | 实现 |
| `packages/academic/source-acl/tests/provider.spec.ts` | 测试 |
| `packages/academic/source-acl/tsconfig.json` | 配置与文档 |

小计：9 个文件；最后修改时间跨度 2026-09-17 ~ 2026-10-09。

#### packages/academic/source-arxiv/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/source-arxiv/README.i18n.yaml` | 配置与文档 |
| `packages/academic/source-arxiv/README.md` | 配置与文档 |
| `packages/academic/source-arxiv/README.zh.md` | 配置与文档 |
| `packages/academic/source-arxiv/package.json` | 配置与文档 |
| `packages/academic/source-arxiv/src/index.ts` | 实现 |
| `packages/academic/source-arxiv/src/normalize.ts` | 实现 |
| `packages/academic/source-arxiv/src/parse.ts` | 实现 |
| `packages/academic/source-arxiv/src/provider.ts` | 实现 |
| `packages/academic/source-arxiv/src/types.ts` | 实现 |
| `packages/academic/source-arxiv/tests/parse.spec.ts` | 测试 |
| `packages/academic/source-arxiv/tests/provider.spec.ts` | 测试 |
| `packages/academic/source-arxiv/tsconfig.json` | 配置与文档 |

小计：12 个文件；最后修改时间跨度 2026-09-11 ~ 2026-10-14。

#### packages/academic/source-cvf/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/source-cvf/README.i18n.yaml` | 配置与文档 |
| `packages/academic/source-cvf/README.md` | 配置与文档 |
| `packages/academic/source-cvf/README.zh.md` | 配置与文档 |
| `packages/academic/source-cvf/package.json` | 配置与文档 |
| `packages/academic/source-cvf/src/index.ts` | 实现 |
| `packages/academic/source-cvf/src/parse.ts` | 实现 |
| `packages/academic/source-cvf/src/provider.ts` | 实现 |
| `packages/academic/source-cvf/tests/provider.spec.ts` | 测试 |
| `packages/academic/source-cvf/tsconfig.json` | 配置与文档 |

小计：9 个文件；最后修改时间跨度 2026-09-17 ~ 2026-10-09。

#### packages/academic/source-openalex/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/source-openalex/README.i18n.yaml` | 配置与文档 |
| `packages/academic/source-openalex/README.md` | 配置与文档 |
| `packages/academic/source-openalex/README.zh.md` | 配置与文档 |
| `packages/academic/source-openalex/package.json` | 配置与文档 |
| `packages/academic/source-openalex/src/index.ts` | 实现 |
| `packages/academic/source-openalex/src/normalize.ts` | 实现 |
| `packages/academic/source-openalex/src/provider.ts` | 实现 |
| `packages/academic/source-openalex/tests/discovery.e2e.ts` | 测试 |
| `packages/academic/source-openalex/tests/loader-composition.spec.ts` | 测试 |
| `packages/academic/source-openalex/tests/provider.spec.ts` | 测试 |
| `packages/academic/source-openalex/tsconfig.json` | 配置与文档 |

小计：11 个文件；最后修改时间跨度 2026-09-18 ~ 2026-10-09。

#### packages/academic/source-pmlr/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/source-pmlr/README.i18n.yaml` | 配置与文档 |
| `packages/academic/source-pmlr/README.md` | 配置与文档 |
| `packages/academic/source-pmlr/README.zh.md` | 配置与文档 |
| `packages/academic/source-pmlr/package.json` | 配置与文档 |
| `packages/academic/source-pmlr/src/index.ts` | 实现 |
| `packages/academic/source-pmlr/src/parse.ts` | 实现 |
| `packages/academic/source-pmlr/src/provider.ts` | 实现 |
| `packages/academic/source-pmlr/tests/provider.spec.ts` | 测试 |
| `packages/academic/source-pmlr/tsconfig.json` | 配置与文档 |

小计：9 个文件；最后修改时间跨度 2026-09-17 ~ 2026-10-09。

#### packages/academic/workflow/

| 文件 | 类别 |
| --- | --- |
| `packages/academic/workflow/README.i18n.yaml` | 配置与文档 |
| `packages/academic/workflow/README.md` | 配置与文档 |
| `packages/academic/workflow/README.zh.md` | 配置与文档 |
| `packages/academic/workflow/package.json` | 配置与文档 |
| `packages/academic/workflow/src/candidate-batches.ts` | 实现 |
| `packages/academic/workflow/src/entry.ts` | 实现 |
| `packages/academic/workflow/src/evidence-progress.ts` | 实现 |
| `packages/academic/workflow/src/fragment-model.ts` | 实现 |
| `packages/academic/workflow/src/hybrid-run.ts` | 实现 |
| `packages/academic/workflow/src/hybrid-search.ts` | 实现 |
| `packages/academic/workflow/src/index.ts` | 实现 |
| `packages/academic/workflow/src/model-call.ts` | 实现 |
| `packages/academic/workflow/src/model-errors.ts` | 实现 |
| `packages/academic/workflow/src/model-limits.ts` | 实现 |
| `packages/academic/workflow/src/model-pipeline.ts` | 实现 |
| `packages/academic/workflow/src/model-prompt.ts` | 实现 |
| `packages/academic/workflow/src/model-types.ts` | 实现 |
| `packages/academic/workflow/src/model.ts` | 实现 |
| `packages/academic/workflow/src/paper.ts` | 实现 |
| `packages/academic/workflow/src/parse-evidence.ts` | 实现 |
| `packages/academic/workflow/src/pipeline-types.ts` | 实现 |
| `packages/academic/workflow/src/pipeline.ts` | 实现 |
| `packages/academic/workflow/src/progress.ts` | 实现 |
| `packages/academic/workflow/src/query-workflow.ts` | 实现 |
| `packages/academic/workflow/src/recovery-checkpoint.ts` | 实现 |
| `packages/academic/workflow/src/recovery.ts` | 实现 |
| `packages/academic/workflow/src/report-disclosure.ts` | 实现 |
| `packages/academic/workflow/src/retrieval-run.ts` | 实现 |
| `packages/academic/workflow/src/selection.ts` | 实现 |
| `packages/academic/workflow/src/settlement-events.ts` | 实现 |
| `packages/academic/workflow/src/synthesis-model.ts` | 实现 |
| `packages/academic/workflow/src/types.ts` | 实现 |
| `packages/academic/workflow/tests/candidate-batches.spec.ts` | 测试 |
| `packages/academic/workflow/tests/handoff.spec.ts` | 测试 |
| `packages/academic/workflow/tests/hybrid-search.spec.ts` | 测试 |
| `packages/academic/workflow/tests/model.spec.ts` | 测试 |
| `packages/academic/workflow/tests/parallel-papers.spec.ts` | 测试 |
| `packages/academic/workflow/tests/parse-evidence.spec.ts` | 测试 |
| `packages/academic/workflow/tests/pe1-handoff.spec.ts` | 测试 |
| `packages/academic/workflow/tests/pe4-integration.spec.ts` | 测试 |
| `packages/academic/workflow/tests/pipeline-fixture.ts` | 测试 |
| `packages/academic/workflow/tests/pipeline.spec.ts` | 测试 |
| `packages/academic/workflow/tests/progress.spec.ts` | 测试 |
| `packages/academic/workflow/tests/question-links.e2e.ts` | 测试 |
| `packages/academic/workflow/tests/recovery.spec.ts` | 测试 |
| `packages/academic/workflow/tests/replenishment-plugin.ts` | 测试 |
| `packages/academic/workflow/tests/replenishment.spec.ts` | 测试 |
| `packages/academic/workflow/tests/selection.spec.ts` | 测试 |
| `packages/academic/workflow/tests/snapshot-plugin.ts` | 测试 |
| `packages/academic/workflow/tsconfig.json` | 配置与文档 |
| `packages/academic/workflow/tsconfig.tests.json` | 配置与文档 |

小计：51 个文件；最后修改时间跨度 2026-09-16 ~ 2026-10-20。
### packages/api/academic-research-controller/


#### packages/api/academic-research-controller/

| 文件 | 类别 |
| --- | --- |
| `packages/api/academic-research-controller/README.i18n.yaml` | 配置与文档 |
| `packages/api/academic-research-controller/README.md` | 配置与文档 |
| `packages/api/academic-research-controller/README.zh.md` | 配置与文档 |
| `packages/api/academic-research-controller/package.json` | 配置与文档 |
| `packages/api/academic-research-controller/src/background-run.ts` | 实现 |
| `packages/api/academic-research-controller/src/candidate-review-model.ts` | 实现 |
| `packages/api/academic-research-controller/src/candidate-screening.ts` | 实现 |
| `packages/api/academic-research-controller/src/hybrid-view.ts` | 实现 |
| `packages/api/academic-research-controller/src/index.ts` | 实现 |
| `packages/api/academic-research-controller/src/plan-validation.ts` | 实现 |
| `packages/api/academic-research-controller/src/planned-retrieval.ts` | 实现 |
| `packages/api/academic-research-controller/src/q6-projection.ts` | 实现 |
| `packages/api/academic-research-controller/src/research-brief-plan.ts` | 实现 |
| `packages/api/academic-research-controller/src/run-stream.ts` | 实现 |
| `packages/api/academic-research-controller/src/search.ts` | 实现 |
| `packages/api/academic-research-controller/src/types.ts` | 实现 |
| `packages/api/academic-research-controller/tests/__snapshots__/candidate-review-model.spec.ts.snap` | 测试 |
| `packages/api/academic-research-controller/tests/background-run.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/candidate-review-handoff.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/candidate-review-model.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/candidate-screening.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/controller.host.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/hybrid-retrieval-contract.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/hybrid-search-plugin.ts` | 测试 |
| `packages/api/academic-research-controller/tests/hybrid-view.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/plan-validation.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/planned-retrieval.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/progress-contract.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/q6-projection.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tests/search.spec.ts` | 测试 |
| `packages/api/academic-research-controller/tsconfig.json` | 配置与文档 |

小计：31 个文件；最后修改时间跨度 2026-09-21 ~ 2026-10-20。
### packages/client/ui-academic-research/


#### packages/client/ui-academic-research/

| 文件 | 类别 |
| --- | --- |
| `packages/client/ui-academic-research/README.i18n.yaml` | 配置与文档 |
| `packages/client/ui-academic-research/README.md` | 配置与文档 |
| `packages/client/ui-academic-research/README.zh.md` | 配置与文档 |
| `packages/client/ui-academic-research/package.json` | 配置与文档 |
| `packages/client/ui-academic-research/src/client/EnhancementPanel.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/HybridRetrieval.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/ProgressPanel.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/Q6Candidates.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/Q6Coverage.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/Q6Live.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/Q6Page.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/Q6Plan.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/ResearchEntry.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/RunExperience.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/RunPanel.module.css` | 实现 |
| `packages/client/ui-academic-research/src/client/RunPanel.tsx` | 实现 |
| `packages/client/ui-academic-research/src/client/background-view.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/enhancement-history.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/index.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/locales.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/q6-locales.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/q6-sample.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/q6-types.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/render.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/retrieval-report.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/run-experience-locales.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/run-experience-sample.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/run-experience-types.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/run-locales.ts` | 实现 |
| `packages/client/ui-academic-research/src/client/run-types.ts` | 实现 |
| `packages/client/ui-academic-research/src/css-modules.d.ts` | 实现 |
| `packages/client/ui-academic-research/src/index.ts` | 实现 |
| `packages/client/ui-academic-research/tests/apply.client.spec.ts` | 测试 |
| `packages/client/ui-academic-research/tests/background.fixture.client.ts` | 测试 |
| `packages/client/ui-academic-research/tests/enhancement.client.spec.tsx` | 测试 |
| `packages/client/ui-academic-research/tests/fixtures.client.ts` | 测试 |
| `packages/client/ui-academic-research/tests/fixtures/run-experience.sample.json` | 测试 |
| `packages/client/ui-academic-research/tests/hybrid.client.spec.tsx` | 测试 |
| `packages/client/ui-academic-research/tests/interactions.client.spec.ts` | 测试 |
| `packages/client/ui-academic-research/tests/page.client.spec.ts` | 测试 |
| `packages/client/ui-academic-research/tests/progress.client.spec.tsx` | 测试 |
| `packages/client/ui-academic-research/tests/q6-live.client.spec.tsx` | 测试 |
| `packages/client/ui-academic-research/tests/q6-live.fixture.client.ts` | 测试 |
| `packages/client/ui-academic-research/tests/q6.client.spec.tsx` | 测试 |
| `packages/client/ui-academic-research/tests/research-entry.client.spec.tsx` | 测试 |
| `packages/client/ui-academic-research/tests/run-experience.client.spec.tsx` | 测试 |
| `packages/client/ui-academic-research/tests/run-panel.client.spec.tsx` | 测试 |
| `packages/client/ui-academic-research/tests/run-sample.ts` | 测试 |
| `packages/client/ui-academic-research/tests/run-scenarios.client.ts` | 测试 |
| `packages/client/ui-academic-research/tsconfig.json` | 配置与文档 |
| `packages/client/ui-academic-research/tsdown.config.ts` | 配置与文档 |

小计：51 个文件；最后修改时间跨度 2026-09-15 ~ 2026-10-20。
### packages/preset/agent-presets/presets/academic/


#### packages/preset/agent-presets/presets/academic/

| 文件 | 类别 |
| --- | --- |
| `packages/preset/agent-presets/presets/academic/agent.cordis.yml` | 预设与提示词 |
| `packages/preset/agent-presets/presets/academic/preset.yml` | 预设与提示词 |
| `packages/preset/agent-presets/presets/academic/skills/academic-insight-report/SKILL.md` | 预设与提示词 |
| `packages/preset/agent-presets/presets/academic/skills/academic-insight-report/references/report-format.md` | 预设与提示词 |
| `packages/preset/agent-presets/presets/academic/skills/academic-insight-report/references/research-brief.md` | 预设与提示词 |

小计：5 个文件；最后修改时间跨度 2026-09-07 ~ 2026-10-15。

合计：342 个文件（academic 255 + controller 31 + ui 51 + preset 5）。

## 三、必要基座修改清单

33 个基座文件在 T0 中引用学术能力。迁入时先取 U0 版本，再叠加学术改动；每项改动需登记来源提交并附对应测试。

| 基座位置 | 文件 | U0 现状与迁入动作 |
| --- | --- | --- |
| `packages/api/remotes/` | `package.json`、`README.md`、`src/client/index.ts`、`tsconfig.client.json` | U0 均存在；只在客户端注册表补学术 Remote，`package.json` 补学术依赖，README 补条目 |
| `packages/bundle/web-app/` | `cordis.patch.yml`、`package.json` | U0 均存在且已无 `code-runtime`、invariants 行；只新增学术 Controller／UI 行与 workspace 依赖 |
| `packages/client/ui-agent-preset/` | `src/client/locales.ts`、`tests/locales.client.spec.ts` | 新增学术预设文案；U0 文案由 locale 字典拥有，需按 `verify-client-ui-i18n` 走 typed 字典 |
| `packages/client/ui-user-questions/` | `README.md`、`README.zh.md`、`src/client/PlanReviewPanel.tsx`、`tests/plan-review-panel.client.spec.tsx` | 计划审批面板的学术字段与交互；需核对 U0 面板结构与批准语义未变 |
| `packages/core/session/` | `src/known-event-types.ts` | 登记学术事件类型；须遵守 `SessionEventMap` 必读语义与 `SESSION_FORMAT_VERSION` 规则 |
| `packages/extensions/cordis-client-runner/` | `src/client/slot-catalog.ts` | 新增学术 slot 目录项 |
| `packages/extensions/tool-cordis/` | `src/api-catalog.ts` | U0 已无 `invariants` 条目；只补学术 API 目录项 |
| `packages/preset/agent-presets/` | `presets/academic/**`（5）、`src/display.ts`、`tests/display.spec.ts`、`tests/shipped-root.spec.ts` | 预设本体随包迁入；显示名与 shipped-root 断言按 U0 预设装载结构重写 |
| `packages/README.md`、`packages/README.zh.md` | 目录说明 | 新增 `academic/` 行；双语配对必须同步 |
| `packages/test-support/session-snapshot/` | `README.md`、`README.zh.md`、`src/normalize.ts`、`tests/normalize.spec.ts` | 学术事件的归一化支持；快照归属遵循 `snapshots/AGENTS.md` |
| `packages/web/tool-web/` | `README.md`、`src/fetch.ts`、`tests/tool-web.spec.ts` | 学术检索对 Web 抓取的复用点；核对 U0 tool-web 接口后再改 |
| `packages/web/web/README.md`、`packages/web/web-fetch-http/README.md` | 文档 | 仅在接口确有变化时更新 |

## 四、来源提交登记

| 来源 | 内容 | 说明 |
| --- | --- | --- |
| T0 树 | 上述 342 个学术入口文件、33 个基座耦合文件 | 迁入版本基线；逐文件最后修改提交按第二节命令还原 |
| 团队 master 增量「补齐完整候选池筛选与送审交接」 | `packages/api/academic-research-controller/tests/candidate-pool-handoff.spec.ts` | T0 之后进入主线的唯一非文档改动，随 Controller 迁入 |
| U0 标签 `dsh-v0.2.1-rc.2` | 全部基座文件、`vendor/cordis` 4.0.5、翻译配对记录新格式 | 基座与工程配置以 U0 为准，不回落 T0 写法 |

## 五、迁入顺序与检查点

按依赖方向分批迁入，每批结束运行仓库要求的检查并登记证据：

1. **基座装配**：`packages/bundle/web-app/`、`packages/api/remotes/`、`packages/core/session/known-event-types.ts`、`packages/extensions/*`、`packages/README*`。检查点：Web 启动并可选到学术模式（对应 B-U1）。
2. **底层模型与来源**：`academic/model`、`academic/source*`、`academic/ingestion`。检查点：包编译、单元测试、双语配对。
3. **检索与证据**：`academic/retrieval`、`academic/evidence`、`academic/analysis`、`academic/eval`。检查点：固定样本回放（对应 B-U3）。
4. **工作流与报告**：`academic/workflow`、`academic/report`。检查点：小范围研究产出草稿与失败原因（对应 B-U4）。
5. **接口、页面与预设**：`packages/api/academic-research-controller/`、`packages/client/ui-academic-research/`、`packages/preset/agent-presets/presets/academic/`、`packages/client/ui-user-questions/`。检查点：计划生成与批准、进度刷新查看（对应 B-U2）。
6. **T0 之后增量与 Trace**：`candidate-pool-handoff.spec.ts`，以及 C 交付后按 B-T0／B-T1 接入 Trace 采集。

## 六、风险与待确认

- U0 为 `0.2.1-rc.2` 候选版，后续稳定版可能要求重新验证。
- 翻译配对记录格式在 U0 改为按章节 16 位哈希（T0 为整文件 40 位）；已转换的 3 个 `README.i18n.yaml` 需随迁入文件保持新格式。
- 客户端文案在 U0 由 locale 字典拥有，学术页面文案须改为 typed 字典或本地化原语，不能硬编码。
- `packages/preset/agent-presets/` 的预设装载与显示断言在 U0 结构下需重写，不能直接套用 T0 测试。
- 第零轮的固定样本结果尚未保存；缺少旧版证据的验收项仍标为待补。
- 本清单只登记迁入范围与来源，未迁移任何文件，也未声明任何学术功能在新基座可用。
