# 开发记录：B-U0 T0→master 增量登记与迁入清单

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-21 |
| 负责人 | yzyhello（B） |
| 对应路线 | `upgrade/port-academic`（U0 迁入 T0 学术能力） |
| 工作目录 | `D:\agent-project\insight-agent-u0` |
| 对比基线 | T0 = `bee2f554404a687e61c19175ea8a68c52fb4451a`；团队 `master` = `f55934cb17`；U0 = `687f282e8625c6b8d11ff58211a90524be2e4317` |
| 方法 | 只读 `git diff`／`git ls-tree`／`git grep`，未联网、未改源码 |
| 远程状态 | 随本记录提交推送 |

## 目的

按[学术洞察上游升级双路线与持续开发分工](../../模块分工/academic-upstream-upgrade-dual-route-team-plan.md)第零轮要求，登记 T0 之后的团队增量，建立 U0 与团队版本的目录／包组对照，并给出学术能力逐项迁入清单的第一块（范围、基座耦合点、依赖可行性）。

## 一、T0→master 增量登记

T0 至 master 共 10 个提交：

| 提交 | 类型 | 说明 |
| --- | --- | --- |
| `929aed141d` | 合并 | PR #103（B 评分复核） |
| `e5935fed45` | 文档 | 记录候选评分与队列核对结论 |
| `b88c3787b4` | 测试 + 文档 | 补齐完整候选池筛选与送审交接（全池材料 + 离线校验 spec） |
| `e9f3b6e9c1` | 文档 | 明确上游升级双路线与 ABC 分工 |
| `f9517f1cb9` | 合并 | PR #104 |
| `69fdf8d2b7` | 文档 | 补充 Trace 接口约定与升级适配分工 |
| `af70b46e49` | 合并 | PR #105 |
| `53c596c890` | 文档 | 记录 B 全池送审与遗漏核对 |
| `a29d8f4026` | 文档 | 补记 B 全池核对记录远程状态 |
| `f55934cb17` | 合并 | PR #106（B CR3） |

**非文档改动只有 1 个文件**：`packages/api/academic-research-controller/tests/candidate-pool-handoff.spec.ts`（另加 3 个 Agent Note 文件：`2026-10-19-bounded-academic-candidate-review.{md,zh.md,i18n.yaml}`）。

结论：团队学术代码主体已经在 T0 内；T0 之后主要是文档与一个离线校验 spec。迁入范围以 T0 全量学术能力为准，增量只补这一个 spec。

## 二、U0 与团队版本目录／包组对照

**团队独有包组 → U0 对应位置**：

| 团队包组 | U0 情况 |
| --- | --- |
| `packages/academic/`（14 子包） | U0 无，B 新增 |
| `packages/hooks/` | 移到 `packages/experimental/hook-protocol`、`hooks-claude-code`、`hooks-codex` |
| `packages/webhook/` | 移到 `packages/experimental/webhook`、`webhook-github` |
| `packages/runtime-diagnostics/invariants` | U0 无该名义包（待查，见第六节） |
| `packages/e2b/` | U0 无（待查） |
| `packages/code-runtime/` | U0 无（待查，可能有 `experimental/webworker-runtime`、`experimental/ptc-runtime-python` 等替代） |

**U0 新增包组**：`browser-use`、`computer-use`、`deliverables`、`document`、`ptc-runtime`、`ssh`、`telemetry`。

**apps**：团队 `apps/{cli,web}` → U0 `apps/{cli,desktop,desktop-host,plugin-market-generator,web}`。

**vendor**：`cordis` 4.0.2 → 4.0.5；U0 新增 `vendor/cordis-rc11-upgrade-plan.md`（拟升级到 4.0.0-rc.11，`Status: proposed`，未实施）。

## 三、学术能力迁入清单（第一块）

四个学术入口的文件数（团队 master）：

| 入口 | 文件数 | U0 目标位置 |
| --- | --- | --- |
| `packages/academic/` | 255 | `packages/academic/`（新增） |
| `packages/api/academic-research-controller/` | 32 | `packages/api/academic-research-controller/`（新增） |
| `packages/client/ui-academic-research/` | 51 | `packages/client/ui-academic-research/`（新增） |
| `packages/preset/agent-presets/presets/academic/` | 5 | `packages/preset/agent-presets/presets/academic/` |

`packages/academic/` 子包：`analysis`、`eval`、`evidence`、`ingestion`、`model`、`report`、`retrieval`、`source`、`source-acl`、`source-arxiv`、`source-cvf`、`source-openalex`、`source-pmlr`、`workflow`。

**基座耦合文件（团队 master 中引用 academic、且不属于上述四个入口的 33 个文件）**：

| 基座位置 | 文件 |
| --- | --- |
| `packages/api/remotes/` | `package.json`、`README.md`、`src/client/index.ts`、`tsconfig.client.json` |
| `packages/bundle/web-app/` | `cordis.patch.yml`、`package.json` |
| `packages/client/ui-agent-preset/` | `src/client/locales.ts`、`tests/locales.client.spec.ts` |
| `packages/client/ui-user-questions/` | `README.md`、`README.zh.md`、`src/client/PlanReviewPanel.tsx`、`tests/plan-review-panel.client.spec.tsx` |
| `packages/core/session/` | `src/known-event-types.ts` |
| `packages/extensions/cordis-client-runner/` | `src/client/slot-catalog.ts` |
| `packages/extensions/tool-cordis/` | `src/api-catalog.ts` |
| `packages/preset/agent-presets/` | `presets/academic/**`、`src/display.ts`、`tests/display.spec.ts`、`tests/shipped-root.spec.ts` |
| `packages/README.md` / `.zh.md` | 目录说明 |
| `packages/test-support/session-snapshot/` | `README.md`、`README.zh.md`、`src/normalize.ts`、`tests/normalize.spec.ts` |
| `packages/web/tool-web/` | `README.md`、`src/fetch.ts`、`tests/tool-web.spec.ts` |
| `packages/web/web/README.md`、`packages/web/web-fetch-http/README.md` | 文档 |

这 33 个文件是"必要基座修改"的候选清单，逐项迁入时需登记来源提交。

## 四、基座依赖可行性核对

学术包依赖的 `@deepseek-ai/*` 包共 22 个，逐一核对 U0 是否存在：

- **21 个在 U0 `packages/` 中已存在**：`dsh-typert-protocol`、`dsh-token-meter`、`dsh-brand`、`dsh-llm`、`dsh-session-persistence`、`dsh-util-crypto`、`dsh-agent`、`dsh-tools`、`dsh-session`、`dsh-web`、`dsh-session-persistence-jsonl`、`dsh-client-ui-renderer`、`dsh-api-remotes`、`dsh-client-locale`、`dsh-session-projection`、`dsh-llm-deepseek`、`dsh-client-ui-sidebar`、`dsh-client-ui-slots`、`dsh-client-ui-session`、`dsh-client-ui-primitives`、`dsh-api-session-controller`。
- **2 个在 U0 `vendor/` 中**：`@deepseek-ai/cordis`、`@deepseek-ai/schemastery`。

结论：学术能力所需的基座包在 U0 **全部存在**，没有缺失的依赖 seam。

## 五、已确认的基座变更

- **翻译配对记录格式**：T0 为整文件 40 位哈希（`README.md: <hash>`），U0 为按章节 16 位哈希（`/section:\n  en: ...\n  zh: ...`）。已用 U0 的 `verify-translation-pairing --write` 转换团队 3 个 `README.i18n.yaml`（见[工作区与运行隔离记录](2026-10-21-yzyhello-B-U0-工作区与运行隔离.md)）。
- **Cordis 版本**：vendor `cordis` 4.0.2 → 4.0.5。
- **包组迁移**：`hooks`、`webhook` 已移入 `packages/experimental/`。

## 六、待查项

- `packages/runtime-diagnostics/invariants`（`@deepseek-ai/dsh-invariants`）在 U0 无同名包；学术包**未**直接依赖它，但团队其他基座包可能依赖，需在迁入前确认其 U0 归属或移除影响。
- `packages/e2b/`、`packages/code-runtime/` 在 U0 无同名包，需确认是被移除还是被 `experimental/*` 新包替代，以及学术链路是否间接依赖。
- U0 `vendor/cordis-rc11-upgrade-plan.md` 为拟议中的 Cordis 升级，尚未实施；迁入前确认是否需要跟随。

## 七、下一步

1. 逐项迁入清单细化到文件级，并记录每个来源提交（B 逐项迁入清单的正式版）。
2. 运行 `pnpm run build` + `scripts/start-insight-web.ps1` 验证 U0 Web 基础运行（第一轮前置）。
3. 处理第六节待查项，确认后并入必要基座修改清单。
