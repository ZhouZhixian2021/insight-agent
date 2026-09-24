---
description: "学术来源 seam：学术搜索、单条引用核验结果、提供方可用性与 AcademicSourceError。"
kind: "subsystem"
---

# 学术来源

[English](academic-source.md) | 中文

学术来源 seam 是一个[能力 seam](../../.agents/notes/implemented/architecture/2026-09-11-academic-source-capability-seam.zh.md)，横跨一个 `ctx.academicSource` 服务。Service Definition（[dsh-academic-source](../../packages/academic/source)）拥有 `ctx.academicSource` 与 Provider 注册表；arXiv、OpenAlex、CVF、ACL Anthology 与 PMLR 提供当前的 Service Provider，工作流消费规范化结果。学术来源是一项可选能力，不属于 agent loop（智能体循环）主干，因此其词汇定义在此而非 [core.md](core.zh.md) 中。

源码：[`packages/academic/source/src/types.ts`](../../packages/academic/source/src/types.ts)

## 搜索请求与结果

每个 seam 请求只携带一个 `query`。`maxResults` 是消费方自有的上限，通过 seam 传递并在返回时强制执行——如果提供方返回超量，seam 截断 `works[]` 并设置 `truncated`。搜索返回 provider 中立的 `AcademicSourceWork` 项，每一项都是来自[共享模型](academic-insight.zh.md)的一对 `{ academicWork, workVersion }`：`academicWork` 是全新的成果身份，`workVersion` 是它唯一的不可变版本，因此跨记录的版本关联与去重留在摄取增量中，而不属于提供方。

## 单条引用核验

`AcademicReference` 标识从 Web 结果识别的一个 DOI、arXiv ID 或带命名空间的 ACL/PMLR/CVF 记录；其中发现 URL 只记录候选来自哪里，不作为论文元数据。`verifyReference()` 检查调用方的 Provider 允许列表，请对应的已注册 Provider 读取单篇官方记录，并返回 `AcademicReferenceVerificationOutcome`：包含可选全文 URL 的已核验 `AcademicSourceWork`，或一条分类失败。混合检索工作流在摄取前把已核验的发现 URL 和核验 Provider 附加到 `AcademicSourceWork.verifiedDiscoveries`。目录搜索不可用不影响已注册 Provider 核对精确记录。缺少核验方法属于配置错误；调用方取消会中止，而非生成失败结果。核验不下载全文，也不创建证据。

## 多提供方批次结果

`searchAll()` 运行配置的发现 Provider；未配置时运行每个可用 Provider。`searchProviders()` 则仅运行单次请求指定的 ID，并在网络访问前拒绝无效选择。两者都把结果聚合成 `AcademicSourceSearchBatchResult`。单个提供方的失败不会丢弃其他提供方的成果：可预期的搜索失败变成 `batch.failures` 中的来源级 `ProviderFailure`，而幸存的成果保留在 `batch.items` 中，因此两者同时存在的轮次是 `partial_success`，全部成功（包括零结果搜索）是 `success`，只有失败的轮次是 `failed` 且保留全部失败明细。seam 把被拒绝的 `AcademicSourceError` 转换为携带提供方不含凭据消息的可重试上游失败；非预期的拒绝值以 `unknown` 类别呈现且不可重试，搜索级失败从不设置 `affectedWorkVersionId`。配置错误仍然抛出对应的选择错误代码，调用方取消会让整轮以 `ACADEMIC_SOURCE_ABORTED` 中止，而不是编造提供方失败。

`providers` 列出实际发起搜索的每个 id——包括零结果与失败的提供方——按提供方 id 排序并去重。`discoveredRecords` 统计应用聚合 `maxResults` 上限之前各提供方返回的记录数；`truncated` 在提供方或聚合上限丢弃记录时置位；`limitations` 携带每个被调用提供方声明的覆盖限制（即提供方接口的可选 `limitations` 字段），并在总上限丢弃记录时追加一条聚合上限条目。继承的 `works` 与 `truncated` 字段镜像 `batch.items`，供工作流仍在使用的单结果适配器形态消费。

## 提供方可用性

提供方的 `available(): boolean` 是廉价的本地检查（凭证是否存在、配置是否可解析），禁止发起网络调用。它是执行时选择提供方的输入，而不是健康检查系统：`search()` 读取它来选择可用提供方，选择失败时会给出调用方据此分支处理的结构化 `AcademicSourceError`。选择从不依赖注册顺序、配置顺序或 HMR 顺序：一项能力要么有显式的提供方 id（配置 `searchProvider`，或填充同一字段的对应环境变量），要么在恰好只有一个可用提供方注册时自动选择；存在多个可用提供方却未配置 id 时抛出 `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`，而不会选用最先注册的提供方。

## 错误

`AcademicSourceError` 携带 `code: string`（开放式，与其他 seam 的错误一致），而非封闭联合类型：提供方可以在不修改 `dsh-academic-source` 的情况下抛出自己的错误代码，消费方必须容忍未知错误代码。共享的 `AcademicSourceRuntime` 约定会抛出与 seam 无关的错误代码：`ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE`、`ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING`、`ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE`、`ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`、`ACADEMIC_SOURCE_DUPLICATE_PROVIDER`（注册时的编程错误），以及 `ACADEMIC_SOURCE_PROVIDER_ERROR`（提供方自身故障经 seam 暴露时使用的兜底代码）。

## 服务

`AcademicSourceRuntime` 注册搜索提供方，以 `ACADEMIC_SOURCE_DUPLICATE_PROVIDER` 拒绝重复 id，并在执行时以结构化的选择错误解析提供方。每个提供方在自己的包边界把记录转换成规范化的 `{ academicWork, workVersion }` 对；seam 负责选择、转发取消、强制执行 `maxResults`，并把多提供方轮次聚合为一个部分成功的批次。

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

/**
 * Search configured discovery providers, or every usable provider, and merge results round-robin.
 *
 * One provider's failure never discards another provider's results: expected search failures
 * become source-level `ProviderFailure` entries in `batch.failures`, and works from the remaining
 * providers survive in `batch.items`. Every called provider succeeds — including zero-result
 * searches — yields `batch.status: success`; at least one surviving work beside failures yields
 * `partial_success`; only failures yields `failed` with every failure retained. Configuration
 * failures (`ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE` and the other selection codes) still throw,
 * and caller cancellation aborts the whole round as `ACADEMIC_SOURCE_ABORTED` instead of
 * fabricating provider failures.
 *
 * `discoveredRecords` counts every record the providers returned before the aggregate
 * `request.maxResults` bound; `truncated` is set when either a provider or the aggregate bound
 * dropped records; `limitations` carries each called provider's declared coverage limits and one
 * aggregate-bound entry when the total bound dropped records. The inherited `works` and
 * `truncated` fields mirror `batch.items` for the existing single-result adapter shape.
 * @param request - query and total result limit across providers.
 * @param signal - optional cancellation forwarded to every provider.
 * @returns the aggregate batch outcome from all usable providers.
 */
async searchAll(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchBatchResult>

/**
 * Search only the provider ids approved for this request, regardless of discovery configuration.
 * Reject empty, duplicate, missing, or unavailable ids before any provider search starts.
 * @param request - query and total result limit across selected providers.
 * @param providerIds - provider ids approved for this search.
 * @param signal - optional cancellation forwarded to each selected provider.
 * @returns the aggregate batch outcome from the selected providers.
 */
async searchProviders(request: AcademicSourceSearchRequest, providerIds: readonly string[], signal?: AbortSignal): Promise<AcademicSourceSearchBatchResult>

/**
 * Resolve full-text URLs through the provider named by a version's source records.
 * @param version - version selected after ingestion.
 * @returns the first usable provider's ordered candidates, or `null`.
 */
resolveFullText(version: WorkVersion): AcademicSourceFullText | null

/**
 * Verify one Web-discovered paper against the approved owning provider.
 * Search-only availability does not prevent a registered provider from verifying a single record.
 * @param reference - DOI, arXiv ID, or official provider record identified from one Web result.
 * @param allowedProviders - provider ids approved by the research plan for verification.
 * @param signal - caller cancellation, which aborts the whole verification round.
 * @returns the official work and full-text candidates, or one classified failure.
 */
async verifyReference(reference: AcademicReference, allowedProviders: readonly string[], signal?: AbortSignal): Promise<AcademicReferenceVerificationOutcome>
```

Types: [WorkVersion](academic-insight.zh.md)

Source: [`packages/academic/source/src/index.ts`](../../packages/academic/source/src/index.ts)
<!-- END GENERATED cordis-surface -->
