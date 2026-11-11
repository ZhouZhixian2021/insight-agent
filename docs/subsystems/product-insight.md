---
description: "Product insight shared records for approved plans, screened pages, source snapshots, evidence, claims, and partial outcomes."
kind: "subsystem"
---

# Product insight subsystem

English | [中文](product-insight.zh.md)

## Current scope

The [product-insight model](../../packages/product-insight/model/README.md) defines investigation records, the [source library](../../packages/product-insight/source/README.md) discovers and verifies pages through DSH Web, and the [workflow](../../packages/product-insight/workflow/README.md) runs approved plans through semantic review, cross-site comparison, source applicability checks, and cited report delivery checks. The [bundle](../../packages/product-insight/bundle/README.md) offers a selectable preset: after plan review, its Agent tool starts a Session-owned background job and saves source, page declarations, complete recovery checkpoints, evidence, review, comparison, claim, task-state, and report records in the Session. Generic job tools expose progress; `get_product_investigation` reads saved results. Another explicit tool call resumes an interrupted approved plan; automatic continuation, independent publisher ownership verification, and a dedicated report viewer remain separate work.

## Shared records

| Record | Meaning |
| --- | --- |
| `Product` and `ProductPlan` | Stable product identity and a versioned investigation scope. Approval names the exact plan version and may set a per-page text limit, bounded question-gap searches, accepted external publishers, region, version, and source-date requirements. |
| `CandidatePage` | A discovered URL, its source role, question links, and A's explained screening decision. |
| `SourceSnapshot` | One observed page-fetch attempt. Available content has a storage reference, content hash, and optional page-declared publisher, dates, region, and version; failure has a failure ID instead. Published, updated, and observed dates remain distinct. |
| `SearchObservation` | Bounded, numbered links actually seen on a search page, supplied to the optional search-layout recognition event. Selected IDs must refer to this observation. |
| `ProductEvidence` | Version 1 retains one exact excerpt; version 2 retains a primary excerpt and independently located supporting excerpts. All ranges refer to the same saved snapshot and content hash. PDF spans stay on one physical page. |
| `ProductClaim` and `ProductEvidenceGap` | A scoped conclusion with explained confidence and evidence links, or a specific request for missing source material. |
| `ProductRun` and `ProductReportDelivery` | Processing outcome and report-delivery decision are separate; a partial run may retain useful evidence, while a blocked delivery has no report artifact. |
| `ProductInvestigationCheckpoint` | Complete retained discovery, page, evidence, review, claim and comparison facts through a stage cursor, bound to one approved plan and accumulated active execution time. Versions 1–3 resume the saved fragment workflow; version 4 resumes question-targeted passage selection with an in-page question cursor. `gapReadCompleted` marks a settled saved-source reread. `priorVerifications` retains valid comparisons while appended corroboration pages or refreshed sources are processed. |

All cross-package IDs are branded strings. Product versions are optional because a continuously updated service may not publish one. Page content identity comes from the observed snapshot hash and time.

## Pure decisions

`isExecutableProductPlan()` checks approval of the current plan version. `createProductBatchResult()` classifies observed items and failures as success, partial success, or failure; an empty result without failures is success. `checkProductClaimFreshness()` compares a conclusion's plan and source hashes with currently retained evidence and latest page snapshots. A known change returns `stale`; missing current observations return `unverifiable`; `current` alone does not establish semantic support or report eligibility.

The model does not validate untrusted wire values, fetch pages, evaluate whether excerpts support a claim, persist events, or render a report. The producing and consuming packages own those operations.

## Dependency direction

The model depends only on shared identifier and UUID utilities. Product source, workflow, report, controller, and UI packages may consume its public exports; the model does not import those packages or academic-insight internals. The [team field agreement](../../z-team_docs/产品洞察/接口约定/00-首版共享字段方案.md) records A/C ownership and the first investigation scope.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="product-events"></a>

### `product/*` events

<a id="productsearch-recognize--serial"></a>

#### `product/search-recognize` — serial

Select organic result link IDs from untrusted rendered search content.

```ts cordis-catalog
/** Select organic result link IDs from untrusted rendered search content.
 * @mode serial
 * @param observation - Bounded page facts, never evidence.
 * @param signal - Shared operation deadline and cancellation.
 */
'product/search-recognize'(observation: SearchObservation, signal: AbortSignal): Promise<readonly number[] | undefined>
```

Source: [`packages/product-insight/source/src/search-recovery.ts`](../../packages/product-insight/source/src/search-recovery.ts)
<!-- END GENERATED cordis-surface -->
