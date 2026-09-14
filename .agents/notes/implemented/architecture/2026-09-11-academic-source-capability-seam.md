# Agent Note: Academic source capability seam - one provider registry over scholarly providers

Status: implemented

English | [中文](2026-09-11-academic-source-capability-seam.zh.md)

## Problem

Academic insight must reach several scholarly providers (OpenAlex, Crossref, arXiv, and later Semantic Scholar, PubMed) whose raw response shapes differ. A workflow or analysis consumer must program against one provider-neutral "search scholarly works" operation, not against each vendor's API. Binding the model-facing or workflow-facing contract to one vendor would chase that vendor into every downstream package, and each provider registering its own operation would leak provider-specific fields into the shared contract.

There is also a provider-selection question. `inject: ['academicSource']` proves the service exists; it does not prove a usable source provider exists, and it does not define which provider wins when several are registered. The same selection machinery the [web seam](2026-06-24-web-capability-seam.md) built for `search`/`fetch` applies here for `search`.

## Decision

Academic source is a capability seam following [the capability-seam Agent Note](2026-06-13-capability-seams.md):

1. `@deepseek-ai/dsh-academic-source` (`packages/academic/source`) owns `ctx.academicSource`, provider registration, provider selection, the shared request/result vocabulary, and the `AcademicSourceError` taxonomy.
2. Provider packages implement concrete backends and register capabilities with `ctx.academicSource`, translating their own records into the shared `AcademicWork`/`WorkVersion` model at their package boundary. `dsh-academic-source-openalex` is the first provider: it searches the public `/works` endpoint and normalizes each record, so OpenAlex-specific field names never leave the package.
3. A model-facing consumer (a tool, or the workflow/retrieval increment) arrives later. This first slice ships the Service Definition only; until a provider registers, every `search()` fails with `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE`.

The seam is search-only for v1. The request carries `query` and an optional `maxResults`; the result is a `works[]` of `{ academicWork, workVersion }` pairs plus a `truncated` flag. Cross-record version linking, deduplication, and run/coverage statistics belong to later increments: `RetrievalRun`, `CoverageSummary`, `ProviderFailure`, and `BatchResult` are not yet published by the shared model, so the seam surfaces failure only through `AcademicSourceError`.

## Package topology

```text
@deepseek-ai/dsh-academic-model   <--depends on--   @deepseek-ai/dsh-academic-source
      shared records                                interface (ctx.academicSource)
                                                     ^
                                                     | registers normalized works
                             @deepseek-ai/dsh-academic-source-openalex (provider)
```

The Service Definition depends only on `dsh-academic-model`, Cordis, and schemastery (for `Config`). It does not import tool, agent, session, LLM, or provider packages. Providers depend on `dsh-academic-source` and `dsh-academic-model`; only `dsh-academic-source` owns the `ctx.academicSource` key.

## `ctx.academicSource` contract

The authoritative signatures live in `packages/academic/source/src/types.ts`; the seam's shape:

```ts
import type { AcademicSourceSearchRequest, AcademicSourceSearchResult } from '@deepseek-ai/dsh-academic-source'

interface AcademicSourceProvider {
  readonly id: string
  available(): boolean
  search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult>
}

interface AcademicSourceRuntime {
  registerSearchProvider(provider: AcademicSourceProvider): () => void
  search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult>
}
```

The optional `signal` is execution control, not business input: a future consumer passes its execution signal so turn cancellation, timeouts, and agent disposal reach provider network requests. Provider ids are stable strings; a duplicate id throws `ACADEMIC_SOURCE_DUPLICATE_PROVIDER`. Registration returns a disposer and is wrapped in `ctx.effect()` so it tears down with the contributing fiber.

## Provider availability and selection

A provider's `available(): boolean` is a cheap local check (credential presence, parseable config) and must not make network calls. Selection is derived on each call and never depends on registration, config, or HMR order:

| Situation | Execution behavior |
|---|---|
| A configured provider id is registered and `available() === true` | runs that provider |
| A configured provider id is not registered | `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING` |
| A configured provider id is registered but unavailable | `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE` |
| No id configured and exactly one registered usable provider | runs that single provider |
| No id configured and no usable provider | `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE` |
| No id configured and multiple usable providers | `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS` |

The `searchProvider` config field pins a provider; `$DSH_ACADEMIC_SOURCE_SEARCH_PROVIDER` feeds the same field, not a hidden priority chain. `maxResults` flows consumer → seam → provider, and the seam enforces the bound on the way back by truncating `works[]` and setting `truncated`.

## Errors

`AcademicSourceError` carries a stable, open-string `code` and chained `cause`. It deliberately re-implements the `HarnessError` shape instead of extending `@deepseek-ai/dsh-llm`'s base, so the academic business group stays free of the LLM capability package; consumers route on `code`, not the prototype chain. Seam-neutral codes are `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE`, `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING`, `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE`, `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`, `ACADEMIC_SOURCE_DUPLICATE_PROVIDER`, and `ACADEMIC_SOURCE_PROVIDER_ERROR`.

## Alternatives considered

### Fold provider dispatch into a future consumer tool

Rejected. The tool/workflow package would own provider selection, credentials, request mapping, transport, and normalization, coupling the model-facing schema to every vendor at once. The Service Definition keeps selection and the provider contract in one owner independent of how a consumer renders results.

### Let each provider register its own operation

Rejected. Provider packages would own the shared vocabulary and force downstream packages to learn backend details. Providers register capabilities, not tools.

### Derive the result shape from the OpenAlex provider only

Rejected. The seam carries the provider-neutral `AcademicSourceWork` pair over the shared model, so Crossref and arXiv providers return the same shape without editing the seam or downstream packages. `dsh-academic-source-openalex`'s translation coincides with that shape but does not define it.

### Extend `HarnessError` from `@deepseek-ai/dsh-llm`

Rejected for the academic group. The web/filesystem seams extend it, but those seams sit in the general harness tier; the academic group is a self-contained vertical whose lowest layer (`dsh-academic-model`) depends only on shared utilities. Re-implementing the `{ name, code, cause }` shape keeps that boundary while remaining route-compatible where a future consumer maps it.

## Consequences

**The search schema is deliberately thin.** `query` plus `maxResults` only; provider-neutral filters (`publicationWindow`, work types) are added once a driven consumer and multiple providers can honor them honestly.

**No run statistics or coverage reporting yet.** The seam cannot record `RetrievalRun` or `CoverageSummary` until the shared model publishes those records; failure surfaces as `AcademicSourceError` only.

**No model-facing tool yet.** Until a consumer ships, nothing registers a prompt or schema; the capability is reachable only through `ctx.academicSource.search()`.

**Works are single-version.** Each result item is one fresh work identity with one immutable version; cross-record linking and deduplication remain ingestion's responsibility, so a provider search over an overlapping record set returns distinct identities until that increment lands.

## Deferred work

- Provider-neutral filters beyond `query`/`maxResults`.
- A fetch-by-identifier operation (resolving one work by DOI or provider id).
- The model-facing consumer (tool or workflow) that renders normalized works and maps `AcademicSourceError` at the tool boundary.
