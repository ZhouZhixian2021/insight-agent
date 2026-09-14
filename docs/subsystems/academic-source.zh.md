---
description: "学术来源 seam：AcademicSourceSearchRequest/Result、AcademicSourceWork、提供方可用性与 AcademicSourceError。"
kind: "subsystem"
---

# 学术来源

[English](academic-source.md) | 中文

学术来源 seam 是一个[能力 seam](../../.agents/notes/implemented/architecture/2026-09-11-academic-source-capability-seam.zh.md)，横跨一个 `ctx.academicSource` 服务。Service Definition（[dsh-academic-source](../../packages/academic/source)）拥有 `ctx.academicSource` 与提供方注册表；Service Provider（OpenAlex、Crossref、arXiv）与面向模型的 Consumer 在后续增量中到来。学术来源是一项可选能力，不属于 agent loop（智能体循环）主干，因此其词汇定义在此而非 [core.md](core.zh.md) 中。

源码：[`packages/academic/source/src/types.ts`](../../packages/academic/source/src/types.ts)

## 搜索请求与结果

每个 seam 请求只携带一个 `query`。`maxResults` 是消费方自有的上限，通过 seam 传递并在返回时强制执行——如果提供方返回超量，seam 截断 `works[]` 并设置 `truncated`。搜索返回 provider 中立的 `AcademicSourceWork` 项，每一项都是来自[共享模型](academic-insight.zh.md)的一对 `{ academicWork, workVersion }`：`academicWork` 是全新的成果身份，`workVersion` 是它唯一的不可变版本，因此跨记录的版本关联与去重留在摄取增量中，而不属于提供方。

## 提供方可用性

提供方的 `available(): boolean` 是廉价的本地检查（凭证是否存在、配置是否可解析），禁止发起网络调用。它是执行时选择提供方的输入，而不是健康检查系统：`search()` 读取它来选择可用提供方，选择失败时会给出调用方据此分支处理的结构化 `AcademicSourceError`。选择从不依赖注册顺序、配置顺序或 HMR 顺序：一项能力要么有显式的提供方 id（配置 `searchProvider`，或填充同一字段的对应环境变量），要么在恰好只有一个可用提供方注册时自动选择；存在多个可用提供方却未配置 id 时抛出 `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`，而不会选用最先注册的提供方。

## 错误

`AcademicSourceError` 携带 `code: string`（开放式，与其他 seam 的错误一致），而非封闭联合类型：提供方可以在不修改 `dsh-academic-source` 的情况下抛出自己的错误代码，消费方必须容忍未知错误代码。共享的 `AcademicSourceRuntime` 约定会抛出与 seam 无关的错误代码：`ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE`、`ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING`、`ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE`、`ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`、`ACADEMIC_SOURCE_DUPLICATE_PROVIDER`（注册时的编程错误），以及 `ACADEMIC_SOURCE_PROVIDER_ERROR`（提供方自身故障经 seam 暴露时使用的兜底代码）。

## 服务

`AcademicSourceRuntime` 注册搜索提供方，以 `ACADEMIC_SOURCE_DUPLICATE_PROVIDER` 拒绝重复 id，并在执行时以结构化的选择错误解析提供方。每个提供方在自己的包边界把记录转换成规范化的 `{ academicWork, workVersion }` 对；seam 只负责选择、转发取消与强制执行 `maxResults`。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxacademicsource--academicsourceruntime"></a>

### `ctx.academicSource` — `AcademicSourceRuntime`

The academic source access service. Registered as `ctx.academicSource` (one instance per context).

Selection semantics (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, multiple usable providers → `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register an academic source provider. Throws {@link AcademicSourceError}
 * `ACADEMIC_SOURCE_DUPLICATE_PROVIDER` if its id is already registered.
 * Returns a disposer; disposed with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerSearchProvider(provider: AcademicSourceProvider): () => void

/**
 * Run one scholarly search through the selected provider. Resolves the
 * provider at call time with the selection rules above; throws
 * {@link AcademicSourceError} when the capability cannot run. The seam
 * enforces `request.maxResults` on the result: if the provider over-returns,
 * `works[]` is truncated and `truncated` set.
 * @param request - the query and optional result limit.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the provider's normalized works, capped to `request.maxResults`.
 */
async search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult>
```

Source: [`packages/academic/source/src/index.ts`](../../packages/academic/source/src/index.ts)
<!-- END GENERATED cordis-surface -->
