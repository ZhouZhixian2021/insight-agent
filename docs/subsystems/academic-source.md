---
description: "The academic source seam: AcademicSourceSearchRequest/Result/BatchResult, AcademicSourceWork, provider availability, and AcademicSourceError."
kind: "subsystem"
---

# Academic source

English | [中文](academic-source.zh.md)

The academic source seam — a [capability seam](../../.agents/notes/implemented/architecture/2026-09-11-academic-source-capability-seam.md) spanning one `ctx.academicSource` service. The Service Definition ([dsh-academic-source](../../packages/academic/source)) owns `ctx.academicSource` and the provider registry; arXiv, CVF, ACL Anthology, and PMLR supply the current Service Providers, while the workflow consumes normalized results. Academic source is one optional capability, not part of the agent-loop spine, so its vocabulary lives here rather than in [core.md](core.md).

Source: [`packages/academic/source/src/types.ts`](../../packages/academic/source/src/types.ts)

## Search request and result

Each seam request carries exactly one `query`. `maxResults` is a consumer-owned bound passed through the seam and enforced on the way back — if a provider over-returns, the seam truncates `works[]` and sets `truncated`. A search returns provider-neutral `AcademicSourceWork` items, each a `{ academicWork, workVersion }` pair from the [shared model](academic-insight.md): `academicWork` is a fresh work identity and `workVersion` its single immutable version, so cross-record version linking and deduplication stay in the ingestion increment rather than in a provider.

## Multi-provider batch results

`searchAll()` runs every usable provider and aggregates the outcomes into `AcademicSourceSearchBatchResult`. One provider's failure never discards another provider's works: expected search failures become source-level `ProviderFailure` entries in `batch.failures` while surviving works stay in `batch.items`, so a round holding both is `partial_success`, all-success rounds (zero-result searches included) are `success`, and only-failure rounds are `failed` with every failure retained. The seam converts a rejected `AcademicSourceError` into a retryable upstream failure carrying the provider's credential-free message; unexpected rejection values surface as `unknown` and not retryable, and search-level failures never set `affectedWorkVersionId`. Configuration errors still throw their selection codes, and caller cancellation aborts the whole round as `ACADEMIC_SOURCE_ABORTED` rather than fabricating provider failures.

`providers` lists every id whose search was initiated — zero-result and failed providers included — sorted and deduplicated by id. `discoveredRecords` counts the records the providers returned before the aggregate `maxResults` bound, `truncated` is set when either a provider or the aggregate bound dropped records, and `limitations` carries each called provider's declared coverage limits (the provider interface's optional `limitations`) plus one aggregate-bound entry when the total bound dropped records. The inherited `works` and `truncated` fields mirror `batch.items` for the single-result adapter shape the workflow still consumes.

## Provider availability

A provider's `available(): boolean` is a cheap local check (credential presence, parseable config) and must not make network calls. It is an input to execution-time selection, not a health system: `search()` reads it to pick a usable provider, and a selection failure surfaces as the structured `AcademicSourceError` the caller routes on. Selection never depends on registration, config, or HMR order: a capability has an explicit provider id (config `searchProvider`, or the matching env var feeding the same field), or auto-selects when exactly one usable provider is registered; multiple usable providers with no configured id is `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`, not first-wins.

## Errors

`AcademicSourceError` carries a `code: string` (open, like every other seam's error), not a closed union: a provider may raise its own codes without editing `dsh-academic-source`, and consumers must tolerate an unknown code. The seam-neutral codes are raised by the shared `AcademicSourceRuntime` contract: `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE`, `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING`, `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE`, `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`, `ACADEMIC_SOURCE_DUPLICATE_PROVIDER` (a registration-time programming error), and `ACADEMIC_SOURCE_PROVIDER_ERROR` (the catch-all for a provider's own failure surfaced through the seam).

## The service

`AcademicSourceRuntime` registers search providers, rejects duplicate ids with `ACADEMIC_SOURCE_DUPLICATE_PROVIDER`, and resolves providers at execution time with structured selection errors. Each provider translates its own records into normalized `{ academicWork, workVersion }` pairs at its package boundary; the seam selects, forwards cancellation, enforces `maxResults`, and aggregates multi-provider rounds into one partial-success batch.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
 * Resolve full-text URLs through the provider named by a version's source records.
 * @param version - version selected after ingestion.
 * @returns the first usable provider's ordered candidates, or `null`.
 */
resolveFullText(version: WorkVersion): AcademicSourceFullText | null
```

Types: [WorkVersion](academic-insight.md)

Source: [`packages/academic/source/src/index.ts`](../../packages/academic/source/src/index.ts)
<!-- END GENERATED cordis-surface -->
