# Agent Note: searchAll aggregates provider outcomes into one partial-success batch

Status: implemented

English | [中文](2026-09-17-academic-searchall-batch-result.zh.md)

## Problem

Multi-source research needs one provider's failure to preserve the other providers' results, and the run needs coverage facts — which providers were called, how many records existed before the aggregate bound, whether records were dropped, and which coverage limits the sources carry. The team's handoff fixes the result shape while the workflow, Controller, and Web pages are owned by other members changing in parallel, so the seam must publish the new facts without forcing their edits in the same round.

## Decision

`searchAll()` returns `AcademicSourceSearchBatchResult` — `providers`, `discoveredRecords`, `batch: BatchResult<AcademicSourceWork>`, `truncated`, and `limitations`, exactly as the handoff fixes them. The interface extends `AcademicSourceSearchResult`: the inherited `works` mirrors `batch.items` and `truncated` is shared, so the untouched workflow adapter and Controller keep compiling against the flat shape until the integration round consumes the batch fields directly.

The seam awaits every usable provider, converts each rejected `AcademicSourceError` into a retryable `upstream_error` `ProviderFailure` carrying the provider's credential-free message (unexpected rejection values become `unknown` and not retryable), and hands items plus failures to the shared `createBatchResult`. Cancellation aborts the whole round as `ACADEMIC_SOURCE_ABORTED` — rethrowing the provider's abort error, or synthesizing one when the signal is already aborted — and never fabricates a provider failure; selection and configuration errors keep throwing their `AcademicSourceError` codes.

`discoveredRecords` counts each provider's returned records before the aggregate `maxResults` bound; the seam applies no per-provider cap because the fixed interface sample pins `discoveredRecords` above the bound with a provider returning more than `maxResults`. Providers declare source-coverage limits through the optional `AcademicSourceProvider.limitations` field, collected from every called provider — failed and zero-result providers included — and the seam appends one aggregate-bound entry when the total bound drops records.

## Alternatives considered

**Return only the five new fields without extending the flat result.** Rejected because the Controller forwards `searchAll()` straight into the workflow adapter typed to `AcademicSourceSearchResult`; the flat fields are the bridge that keeps the three members' rounds independent.

**Keep `Promise.all` rejection propagation.** Rejected because one provider's outage discarded every other provider's successful results, which is the defect this change removes.

**Cap each provider to `maxResults` inside the seam before aggregating.** Rejected because the fixed sample's `discoveredRecords` exceeds the bound through one provider's over-return; providers receive the request unchanged and their own truncation flag already records a provider-side drop.

**Derive coverage limitations inside the seam.** Rejected because only a provider knows its coverage; the seam would either hardcode provider knowledge or fabricate text.

## Consequences

CVF, ACL Anthology, and PMLR declare their catalog-only coverage through `limitations`; arXiv declares none. The aggregate-bound limitation text is generated with digits (`retained 2 of 5`), not the sample's spelled-out numbers. The integration round that consumes `batch`, `providers`, `discoveredRecords`, and `limitations` to build `RetrievalRun` and `CoverageSummary` should also retire the inherited `works` mirror and may split the single `upstream_error` category once providers expose finer error granularity. Focused suites over scripted providers cover zero-result success, single-source partial success, all-source failure, cancellation, and the aggregate bound; the controller and workflow suites pin the unchanged adapter path.
