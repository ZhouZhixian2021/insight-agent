---
description: "The academic source seam: AcademicSourceSearchRequest/Result, AcademicSourceWork, provider availability, and AcademicSourceError."
kind: "subsystem"
---

# Academic source

English | [中文](academic-source.zh.md)

The academic source seam — a [capability seam](../../.agents/notes/implemented/architecture/2026-09-11-academic-source-capability-seam.md) spanning one `ctx.academicSource` service. The Service Definition ([dsh-academic-source](../../packages/academic/source)) owns `ctx.academicSource` and the provider registry; Service Providers (OpenAlex, Crossref, arXiv) and a model-facing Consumer arrive in later increments. Academic source is one optional capability, not part of the agent-loop spine, so its vocabulary lives here rather than in [core.md](core.md).

Source: [`packages/academic/source/src/types.ts`](../../packages/academic/source/src/types.ts)

## Search request and result

Each seam request carries exactly one `query`. `maxResults` is a consumer-owned bound passed through the seam and enforced on the way back — if a provider over-returns, the seam truncates `works[]` and sets `truncated`. A search returns provider-neutral `AcademicSourceWork` items, each a `{ academicWork, workVersion }` pair from the [shared model](academic-insight.md): `academicWork` is a fresh work identity and `workVersion` its single immutable version, so cross-record version linking and deduplication stay in the ingestion increment rather than in a provider.

## Provider availability

A provider's `available(): boolean` is a cheap local check (credential presence, parseable config) and must not make network calls. It is an input to execution-time selection, not a health system: `search()` reads it to pick a usable provider, and a selection failure surfaces as the structured `AcademicSourceError` the caller routes on. Selection never depends on registration, config, or HMR order: a capability has an explicit provider id (config `searchProvider`, or the matching env var feeding the same field), or auto-selects when exactly one usable provider is registered; multiple usable providers with no configured id is `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`, not first-wins.

## Errors

`AcademicSourceError` carries a `code: string` (open, like every other seam's error), not a closed union: a provider may raise its own codes without editing `dsh-academic-source`, and consumers must tolerate an unknown code. The seam-neutral codes are raised by the shared `AcademicSourceRuntime` contract: `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE`, `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING`, `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE`, `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`, `ACADEMIC_SOURCE_DUPLICATE_PROVIDER` (a registration-time programming error), and `ACADEMIC_SOURCE_PROVIDER_ERROR` (the catch-all for a provider's own failure surfaced through the seam).

## The service

`AcademicSourceRuntime` registers search providers, rejects duplicate ids with `ACADEMIC_SOURCE_DUPLICATE_PROVIDER`, and resolves providers at execution time with structured selection errors. Each provider translates its own records into normalized `{ academicWork, workVersion }` pairs at its package boundary; the seam only selects, forwards cancellation, and enforces `maxResults`.

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
```

Source: [`packages/academic/source/src/index.ts`](../../packages/academic/source/src/index.ts)
<!-- END GENERATED cordis-surface -->
