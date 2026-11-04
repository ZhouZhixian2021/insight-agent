# 上游改写登记表 — 待复核清单

> 历史原稿：数量、路径、命令和实施状态保留当时背景。当前使用请从 [上游合并资料](../../00-目录.md) 进入，勿用历史工具覆盖仓库现行实现。

自动生成于 2026-10-28 20:20。owner 取自该文件最近一次提交的作者；reason 由 diff 自动提取，**需要人工复核**。

风险分 = 上游近半年改动次数 × 我方改动行数，越大越容易在下次升级时冲突。

## 文档（58 条）

| 风险 | 文件 | 负责人 | 理由 |
|---|---|---|---|
| 5304937 | `docs/persistence-catalog.md` | Yzyhello | 文档：补充学术行为说明 |
| 3157319 | `docs/persistence-catalog.zh.md` | Yzyhello | 文档：补充学术行为说明 |
| 283879 | `docs/config-catalog.md` | Yzyhello | 文档：补充学术行为说明 |
| 146288 | `docs/config-catalog.zh.md` | Yzyhello | 文档：补充学术行为说明 |
| 54612 | `docs/module-graph.md` | ZhouZhixian2021 | 文档：subgraph group_academic["packages/academic"] |
| 28864 | `docs/module-graph.zh.md` | ZhouZhixian2021 | 文档：subgraph group_academic["packages/academic"] |
| 3792 | `docs/event-producer-consumer.md` | Yzyhello | 文档：补充学术行为说明 |
| 2365 | `docs/capability-seams.md` | ZhouZhixian2021 | 文档：svc_academicResearchController["ctx.academicResearchController<b |
| 1764 | `docs/event-producer-consumer.zh.md` | Yzyhello | 文档：补充学术行为说明 |
| 1520 | `AGENTS.md` | ZhouZhixian2021 | 文档：academic/ academic research |
| 1188 | `docs/capability-seams.zh.md` | ZhouZhixian2021 | 文档：svc_academicResearchController["ctx.academicResearchController<b |
| 792 | `packages/plan/plan-mode/README.md` | ZhouZhixian2021 | 文档：Tool results persist the explicit `approved` decision in metadat |
| 630 | `packages/plan/plan-mode/README.zh.md` | ZhouZhixian2021 | 文档：工具结果在元数据中保存明确的 `approved` 决定。学术消费者要求 `approved: true`；放弃评审或缺少该元数 |
| 559 | `packages/preset/agent-preset/skills/cordis-composition-reference/references/packages.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 504 | `docs/subsystems/web.zh.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 490 | `packages/test-support/session-snapshot/README.md` | ZhouZhixian2021 | 文档：Academic extraction and synthesis result streams normalize their |
| 490 | `packages/test-support/session-snapshot/README.zh.md` | ZhouZhixian2021 | 文档：传入 `corpusRoot` 的 ACP 套件可通过 `systemPromptSource` 或 `toolSchemasS |
| 432 | `docs/subsystems/web.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 425 | `packages/web/web/README.md` | ZhouZhixian2021 | 文档：A composition that needs web access loads the `dsh-web` service  |
| 361 | `packages/web/web/README.zh.md` | ZhouZhixian2021 | 文档：需要 web 访问的组合会加载 `dsh-web` 服务并挂载至少一个后端——搜索提供方和／或抓取提供方——插件或工具作者随后直 |
| 315 | `packages/web/tool-web/README.md` | ZhouZhixian2021 | 文档：Call `web_fetch` with one `url`. HTML bodies are filtered and re |
| 274 | `packages/llm/llm-pi-ai/README.md` | ZhouZhixian2021 | 文档：Transport and timeout failures record call-local bounded diagnos |
| 264 | `docs/subsystems/plan.zh.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 240 | `packages/llm/llm-pi-ai/README.zh.md` | ZhouZhixian2021 | 文档：传输或超时失败会记录调用独立的有界诊断，包括失败阶段、错误与原因码，以及可用的 HTTP 状态和请求 ID；不记录凭据、请求正文 |
| 231 | `docs/subsystems/plan.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 219 | `packages/bundle/web-app/README.zh.md` | ZhouZhixian2021 | 文档：学术预设是 `presets/academic.patch.yml` 中的声明式 `dsh-agent-preset` 条目。其 |
| 210 | `packages/bundle/web-app/README.md` | ZhouZhixian2021 | 文档：The Academic preset is a declarative `dsh-agent-preset` row in ` |
| 210 | `packages/web/tool-web/README.zh.md` | ZhouZhixian2021 | 文档：用一个 `url` 调用 `web_fetch`。HTML 主体经过过滤后渲染为 markdown（含 GFM 表格与删除线）； |
| 192 | `packages/web/web-fetch-http/README.zh.md` | ZhouZhixian2021 | 文档：description: "ctx.web 的匿名公共 HTTP(S) 抓取后端：有界、安全的 URL 抓取，含同源重定向、文本 |
| 181 | `packages/README.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 180 | `docs/testing.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 160 | `packages/web/web-fetch-http/README.md` | ZhouZhixian2021 | 文档：description: "The anonymous public HTTP(S) fetch backend for ctx |
| 160 | `.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 152 | `docs/AGENTS.md` | ZhouZhixian2021 | 文档：Use relative Markdown links for current files and tags or PR num |
| 136 | `docs/testing.zh.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 116 | `docs/subsystems/README.zh.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 112 | `.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 108 | `packages/client/ui-user-questions/README.zh.md` | ZhouZhixian2021 | 文档：学术审批正文包含六个简洁中文决策标签时，界面将标签分为独立段落，不截断范围或改变待审批计划。审批卡提供本地化修改框；提交非空自然 |
| 104 | `docs/subsystems/README.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 100 | `packages/client/ui-user-questions/README.md` | ZhouZhixian2021 | 文档：Academic review bodies containing the six concise Chinese decisi |
| 82 | `packages/README.zh.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 70 | `.agents/notes/implemented/testing/2026-06-19-real-api-e2e-ci.zh.md` | ZhouZhixian2021 | 文档：GitHub 对两类 PR 扣留 repo secret：head 位于**另一仓库**的 PR，以及 **Dependabot |
| 66 | `packages/api/remotes/README.md` | ZhouZhixian2021 | 文档：The Client assembly mounts Academic research, Office conversion, |
| 64 | `docs/persistence-changes/historical-formats/README.zh.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 64 | `docs/persistence-changes/historical-formats/README.md` | ZhouZhixian2021 | 文档：补充学术行为说明 |
| 55 | `.agents/notes/implemented/testing/2026-06-19-real-api-e2e-ci.md` | ZhouZhixian2021 | 文档：GitHub withholds repo secrets from two kinds of PR: those whose  |
| 54 | `packages/session/session-format-v3-to-v4/README.zh.md` | ZhouZhixian2021 | 文档：只有当本边收到前序 V2→V3 迁移链生成的已转换输入时，才接纳其中的学术事件。本边会重新校验固定载荷，通过 V3→V4 映射迁 |
| 54 | `packages/session/session-format-v3-to-v4/README.md` | ZhouZhixian2021 | 文档：Academic events from V2→V3 are admitted here only as transformed |
| 40 | `.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.zh.md` | ZhouZhixian2021 | 文档：构建进程的回放夹具保持自身 TypeScript 可擦除，并通过包入口导入工作流实现。[Academic 补检夹具](../.. |
| 32 | `packages/session/session-format-catalog/README.zh.md` | ZhouZhixian2021 | 文档：读取历史 V2 子 Session 时，会先通过相邻迁移链，再收集前置事实。此已转换路径接纳经过审计的 T0 学术事件及已校验序 |
| 32 | `packages/session/session-format-v2-to-v3/README.zh.md` | ZhouZhixian2021 | 文档：该入站边还接纳 [`src/academic-schema.ts`](../../../../../packages/session/session-format-v2-to-v3/src/academic-schema.ts) 中固定的  |
| 30 | `packages/session/session-format-v2-to-v3/README.md` | ZhouZhixian2021 | 文档：The incoming edge also admits the fixed T0 academic inventory in |
| 30 | `packages/session/session-format-catalog/README.md` | ZhouZhixian2021 | 文档：Historical V2 child reads use the adjacent migration chain befor |
| 30 | `.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.md` | ZhouZhixian2021 | 文档：Built-process replay fixtures keep their own TypeScript erasable |
| 28 | `snapshots/AGENTS.md` | ZhouZhixian2021 | 文档：An SDK scenario with a frozen replay input can register an indep |
| 24 | `apps/web/tests/expected/agent-preset-selection/menu.expected.md` | ZhouZhixian2021 | 文档：menuitem "Academic insight Research agent for technical frontier |
| 16 | `.agents/notes/implemented/process/2026-08-26-ban-ambiguous-origin-label.zh.md` | ZhouZhixian2021 | 文档：在明确排除范围之外的未登记匹配项会使 `doc-sync` 失败，并报告对应路径或行号。审查仍需先判断预期含义再选择替代名称；通 |
| 16 | `.agents/notes/implemented/process/2026-08-26-ban-ambiguous-origin-label.md` | ZhouZhixian2021 | 文档：Maintained tracked paths and text must not contain that token in |

## 配置（38 条）

| 风险 | 文件 | 负责人 | 理由 |
|---|---|---|---|
| 5879607 | `docs/persistence-schema.json` | Yzyhello | 配置：新增 key |
| 535907 | `docs/persistence-catalog.i18n.yaml` | Yzyhello | 配置：en: 5a44e069bb7d9a70 |
| 501655 | `pnpm-lock.yaml` | ykxy11 | 配置：devDependencies: |
| 11592 | `packages/bundle/web-app/cordis.patch.yml` | ZhouZhixian2021 | 配置：config: |
| 7981 | `tsconfig.base.json` | ZhouZhixian2021 | 配置：登记学术包与预设 |
| 6592 | `tsconfig.host.json` | ZhouZhixian2021 | 配置：新增 path |
| 5712 | `.github/workflows/ci.yml` | ZhouZhixian2021 | 配置：登记学术包与预设 |
| 2265 | `packages/bundle/web-app/package.json` | ZhouZhixian2021 | 配置：登记学术包与预设 |
| 1059 | `package.json` | ZhouZhixian2021 | 配置：新增 duplication |
| 864 | `packages/plan/plan-mode/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: fe62fdc51a40bc92 |
| 816 | `packages/test-support/session-snapshot/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: 3e2b7c52d783dbdc |
| 588 | `packages/web/web/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: 11edc4165e7a1da7 |
| 512 | `packages/web/tool-web/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: a7794605b56fba54 |
| 492 | `packages/llm/llm-pi-ai/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: dd9d0db5b84767eb |
| 440 | `.github/workflows/e2e.yml` | ZhouZhixian2021 | 配置：登记学术包与预设 |
| 428 | `docs/capability-seams.i18n.yaml` | ZhouZhixian2021 | 配置：en: c3538ffe2c5ae475 |
| 384 | `.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.i18n.yaml` | ZhouZhixian2021 | 配置：en: 032eef079789cb48 |
| 364 | `packages/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: 75761f4a4e23dc2a |
| 364 | `packages/web/web-fetch-http/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: 6547dc704ce2eec6 |
| 300 | `packages/bundle/web-app/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: b80099a314656fde |
| 288 | `packages/api/remotes/package.json` | ZhouZhixian2021 | 配置：登记学术包与预设 |
| 276 | `docs/testing.i18n.yaml` | ZhouZhixian2021 | 配置：en: 0e6c8c9df6054b5b |
| 232 | `docs/subsystems/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: 95f7c312c72a9260 |
| 224 | `packages/client/ui-user-questions/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: 029c634137b7051f |
| 209 | `apps/web/tsconfig.json` | ZhouZhixian2021 | 配置：登记学术包与预设 |
| 176 | `docs/subsystems/web.i18n.yaml` | ZhouZhixian2021 | 配置：en: 9b2943e2f479d2ce |
| 132 | `docs/persistence-changes/historical-formats/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: faa69f53072b02b0 |
| 115 | `tsconfig.client.json` | ZhouZhixian2021 | 配置：新增 path |
| 112 | `packages/session/session-format-v3-to-v4/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: 5592e2795c0f61e2 |
| 100 | `docs/subsystems/plan.i18n.yaml` | ZhouZhixian2021 | 配置：en: 1448628417f93867 |
| 93 | `packages/session/session-format-v2-to-v3/package.json` | ZhouZhixian2021 | 配置：新增 zod |
| 84 | `.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.i18n.yaml` | ZhouZhixian2021 | 配置：en: 1bb5b8dc958eda92 |
| 76 | `.agents/notes/implemented/testing/2026-06-19-real-api-e2e-ci.i18n.yaml` | ZhouZhixian2021 | 配置：en: ae9646826fab9f7e |
| 74 | `packages/api/remotes/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: 268929960cd83e15 |
| 68 | `packages/session/session-format-catalog/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: 98514c3d18e77ad7 |
| 68 | `packages/session/session-format-v2-to-v3/README.i18n.yaml` | ZhouZhixian2021 | 配置：en: 72b5a93c8fb44d14 |
| 40 | `.agents/notes/implemented/process/2026-08-26-ban-ambiguous-origin-label.i18n.yaml` | ZhouZhixian2021 | 配置：en: b1be4b7de2a2d35c |
| 36 | `packages/api/remotes/tsconfig.client.json` | ZhouZhixian2021 | 配置：新增 path |

## 源码（28 条）

| 风险 | 文件 | 负责人 | 理由 |
|---|---|---|---|
| 370530 | `packages/extensions/tool-cordis/src/api-catalog.ts` | ZhouZhixian2021 | 源码：新增 AcademicBackgroundRunCancelRequest |
| 8721 | `snapshots/sdk/sdk.snapshot.ts` | Yzyhello | 源码：修改 sdkOracleScenarios |
| 5880 | `vitest.config.ts` | ZhouZhixian2021 | 源码：修改 vitestConfig |
| 5040 | `packages/plan/plan-mode/src/index.ts` | ZhouZhixian2021 | 源码：新增 resolveConfig |
| 4899 | `packages/test-support/session-snapshot/src/suite.ts` | ZhouZhixian2021 | 源码：新增 resolveCorpusSidecarSource |
| 1885 | `packages/llm/llm-pi-ai/src/adapter.ts` | ZhouZhixian2021 | 源码：修改 transport |
| 992 | `packages/client/ui-user-questions/src/client/PlanReviewPanel.tsx` | ZhouZhixian2021 | 源码：修改 handoff |
| 682 | `packages/core/session/src/known-event-types.ts` | ZhouZhixian2021 | 源码：接入学术能力 |
| 672 | `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` | ykxy11 | 源码：keyDomain: 'fixed by the owner\'s key table { [Kind in ChatNodeK |
| 282 | `packages/client/ui-agent-preset/src/client/locales.ts` | ZhouZhixian2021 | 源码：接入学术能力 |
| 280 | `packages/web/tool-web/src/fetch.ts` | ZhouZhixian2021 | 源码：import { WebError, type WebFetchBody, type WebFetchResult } from |
| 264 | `packages/test-support/session-snapshot/src/normalize.ts` | ZhouZhixian2021 | 源码：修改 data |
| 228 | `packages/api/remotes/src/client/index.ts` | ZhouZhixian2021 | 源码：import academicResearchRemote from '@deepseek-ai/dsh-api-academi |
| 208 | `packages/client/ui-user-questions/src/client/locales.ts` | ZhouZhixian2021 | 源码：接入学术能力 |
| 195 | `packages/web/web/src/index.ts` | ZhouZhixian2021 | 源码：新增 WebFetchExecutionOptions |
| 160 | `packages/web/web-fetch-http/src/provider.ts` | Yzyhello | 源码：接入学术能力 |
| 156 | `packages/llm/llm-pi-ai/src/index.ts` | ZhouZhixian2021 | 源码：onTransportDiagnostic: (detail) => { |
| 126 | `packages/session/session-format-v3-to-v4/src/migration.ts` | ZhouZhixian2021 | 源码：修改 remapped |
| 77 | `packages/web/web/src/types.ts` | Yzyhello | 源码：接入学术能力 |
| 72 | `packages/web/web-fetch-http/src/policy.ts` | Yzyhello | 源码：新增 FetchableKind |
| 72 | `snapshots/acp/acp.snapshot.ts` | ZhouZhixian2021 | 源码：修改 systemPromptSource |
| 56 | `packages/session/session-format-v2-to-v3/src/migration.ts` | ZhouZhixian2021 | 源码：修改 academic |
| 51 | `packages/test-support/session-snapshot/src/index.ts` | ZhouZhixian2021 | 源码：export { |
| 12 | `packages/plan/plan-mode/src/types.ts` | ZhouZhixian2021 | 源码：接入学术能力 |
| 12 | `packages/session/session-format-catalog/src/historical.ts` | ZhouZhixian2021 | 源码：修改 convertedTypes |
| 4 | `packages/session/session-format-v2-to-v3/src/index.ts` | ZhouZhixian2021 | 源码：export * from './academic.ts' |
| 2 | `packages/experimental/client-ui-cot-translation/src/index.ts` | ZhouZhixian2021 | 源码：学术能力接入 |
| 2 | `packages/preset/agent-preset-registry/src/display.ts` | ZhouZhixian2021 | 源码：接入学术能力 |

## 测试（25 条）

| 风险 | 文件 | 负责人 | 理由 |
|---|---|---|---|
| 11655 | `apps/cli/tests/web-agent-presets.e2e.ts` | ZhouZhixian2021 | 测试：reviews consecutive academic plans with the working directory in runtime context |
| 4800 | `packages/plan/plan-mode/tests/plan-mode.spec.ts` | ZhouZhixian2021 | 测试：accepts an explicit initial mode and rejects a non-boolean value |
| 3729 | `packages/plan/plan-mode/tests/integration.spec.ts` | ZhouZhixian2021 | 测试：reviews successive human requests in one session without replanning approved con |
| 3375 | `packages/client/ui-user-questions/tests/plan-review-panel.client.spec.tsx` | ZhouZhixian2021 | 测试：folds the academic handoff while preserving readable scope and the original appr |
| 2112 | `apps/cli/tests/profiles/headless/tests/headless.expected.e2e.ts` | ZhouZhixian2021 | 测试：const retryTrace = parseJsonl(result.stdout) |
| 1944 | `packages/llm/llm-pi-ai/tests/adapter.spec.ts` | ZhouZhixian2021 | 测试：reports the fetch cause separately from the user-visible transport failure |
| 1430 | `apps/web/tests/plan-review.e2e.ts` | ZhouZhixian2021 | 测试：academic concise approval browser flow |
| 837 | `packages/web/tool-web/tests/tool-web.spec.ts` | ZhouZhixian2021 | 测试：does not render PDF bytes into model-facing output |
| 459 | `packages/session/session-format-v2-to-v3/tests/migration.spec.ts` | ZhouZhixian2021 | 测试：it.each([{ approved: true }, { approved: false }, { approved: un |
| 350 | `packages/test-support/session-snapshot/tests/normalize.spec.ts` | ZhouZhixian2021 | 测试：it.each(['assistant/attempt', 'academic/evidence-result', 'acade |
| 300 | `packages/session/session-format-v3-to-v4/tests/migration.spec.ts` | ZhouZhixian2021 | 测试：it.each([{ approved: true }, { approved: false }, { approved: un |
| 180 | `packages/terminal/terminal-bash/tests/local.spec.ts` | ZhouZhixian2021 | 测试：await expect.poll(() => existsSync(readerPidFile), { timeout: 8_ |
| 133 | `packages/web/web/tests/web.spec.ts` | ZhouZhixian2021 | 测试：uses a call-scoped fetch provider without changing the deployment default |
| 59 | `apps/web/tests/agent-preset-selection.e2e.ts` | ZhouZhixian2021 | 测试：expect(snapshot).toContain('Academic insight') |
| 49 | `packages/web/web-fetch-http/tests/fetch-http.spec.ts` | Yzyhello | 测试：fetches a PDF body without decoding its bytes |
| 24 | `packages/client/ui-theme/tests/expected/radius-exceptions.expected.json` | ZhouZhixian2021 | 测试：覆盖学术场景 |
| 7 | `packages/preset/agent-preset-registry/tests/display.spec.ts` | ZhouZhixian2021 | 测试：resolves the shipped academic preset through its dictionary keys |
| 4 | `apps/cli/tests/profiles/headless/team-snapshot.patch.yml` | ZhouZhixian2021 | 测试：inject: [sessionPersistence] |
| 4 | `apps/cli/tests/profiles/headless/subagent-settlement-snapshot.patch.yml` | ZhouZhixian2021 | 测试：inject: [sessionPersistence] |
| 4 | `apps/cli/tests/profiles/headless/goal-snapshot.patch.yml` | ZhouZhixian2021 | 测试：inject: [sessionPersistence] |
| 4 | `apps/cli/tests/profiles/acp/tests/hooks.e2e.ts` | ZhouZhixian2021 | 测试：学术能力接入 |
| 4 | `apps/cli/tests/profiles/acp/tests/escalation.e2e.ts` | ZhouZhixian2021 | 测试：学术能力接入 |
| 4 | `apps/cli/tests/profiles/acp/tests/acp.e2e.ts` | ZhouZhixian2021 | 测试：学术能力接入 |
| 2 | `apps/cli/tests/profiles/headless/retry-snapshot.patch.yml` | ZhouZhixian2021 | 测试：inject: [sessionPersistence] |
| 2 | `apps/cli/tests/profiles/headless/tests/fixtures/cli.patch.yml` | ZhouZhixian2021 | 测试：inject: [sessionPersistence] |

## 脚本（24 条）

| 风险 | 文件 | 负责人 | 理由 |
|---|---|---|---|
| 10962 | `scripts/gen-cordis-catalog.ts` | ZhouZhixian2021 | 脚本：academicResearchController: 'academic-insight.md', |
| 9589 | `scripts/verify-cordis-config.ts` | ZhouZhixian2021 | 脚本：新增 verifyCordisConfigs |
| 8721 | `scripts/ci-workflow.spec.ts` | ZhouZhixian2021 | 脚本：新增 ci |
| 6424 | `scripts/gen-doc-graphs.ts` | ZhouZhixian2021 | 脚本：key: 'academicResearchController', |
| 2160 | `scripts/verify-package-readme-model-experience.ts` | ZhouZhixian2021 | 脚本：扩展以收录学术包 |
| 1480 | `scripts/type-equiv.manifest.json` | ZhouZhixian2021 | 脚本：扩展以收录学术包 |
| 1216 | `scripts/verify-cordis-config.spec.ts` | ZhouZhixian2021 | 脚本：新增 configFixture |
| 639 | `scripts/no-unknown-casts.baseline.json` | ZhouZhixian2021 | 脚本：扩展以收录学术包 |
| 611 | `scripts/project-doc-site.spec.ts` | ZhouZhixian2021 | 脚本：新增 linked |
| 360 | `scripts/verify-repository-references.ts` | ZhouZhixian2021 | 脚本：新增 retainedCommitCandidates |
| 322 | `scripts/check-workspace-constraints.ts` | ZhouZhixian2021 | 脚本：扩展以收录学术包 |
| 256 | `scripts/doc-standard.spec.ts` | ZhouZhixian2021 | 脚本：扩展以收录学术包 |
| 234 | `scripts/coverage-uncovered-locations.cjs` | ZhouZhixian2021 | 脚本：新增 uncoveredRecords |
| 204 | `scripts/verify-repository-references.spec.ts` | ZhouZhixian2021 | 脚本：新增 fixture |
| 204 | `scripts/session-snapshot-corpus.corpus.ts` | ZhouZhixian2021 | 脚本：新增 oracleRoot |
| 95 | `scripts/verify-client-ui-i18n.ts` | ZhouZhixian2021 | 脚本：新增 markup |
| 88 | `scripts/verify-client-ui-i18n.spec.ts` | ZhouZhixian2021 | 脚本：新增 safe |
| 80 | `scripts/cordis-config-files.spec.ts` | ZhouZhixian2021 | 脚本：新增 root |
| 60 | `scripts/verify-concrete-terms.ts` | ZhouZhixian2021 | 脚本：import { checkRetainedDocumentFindings } from './retained-docume |
| 42 | `scripts/coverage-exempt.ts` | ZhouZhixian2021 | 脚本：扩展以收录学术包 |
| 24 | `scripts/verify-node-next-types.ts` | Yzyhello | 脚本：symlinkSync(pkg.dir, link, process.platform === 'win32' ? 'junct |
| 14 | `scripts/client-build-environment.ts` | ZhouZhixian2021 | 脚本：maxBuffer: 16 * 1024 * 1024, |
| 14 | `scripts/persistence-epoch-header.spec.ts` | ZhouZhixian2021 | 脚本：新增 timeout |
| 8 | `scripts/cordis-config-files.ts` | ZhouZhixian2021 | 脚本：扩展以收录学术包 |

## 其他（1 条）

| 风险 | 文件 | 负责人 | 理由 |
|---|---|---|---|
| 39 | `.gitignore` | ZhouZhixian2021 | 其他：学术能力接入 |

## 样式（1 条）

| 风险 | 文件 | 负责人 | 理由 |
|---|---|---|---|
| 387 | `packages/client/ui-user-questions/src/client/PlanReviewPanel.module.css` | ZhouZhixian2021 | 样式：学术界面调整 |
