# Agent Note: Academic insight shares one provider-neutral model package

Status: implemented

English | [中文](2026-09-10-academic-model-package.zh.md)

## Problem

Academic retrieval, single-paper evidence production, and cross-paper reporting need common identifiers and field-state semantics. If each package declares its own records, provider fields leak into analysis and the three implementation owners must coordinate ordinary changes across the same files.

## Decision

`@deepseek-ai/dsh-academic-model` at `packages/academic/model` is the lowest academic-insight package. It owns provider-neutral records and pure helpers but no Cordis service, model call, retrieval adapter, workflow, persistence provider, or UI. Higher academic packages depend on it; it does not depend on them.

Cross-package academic ids are opaque branded strings. The package defines ids for works, immutable work versions, evidence cards, claims, approved research briefs, and failures. `Availability<T>` represents available, unknown, inapplicable, not-extracted, and failed fields as separate discriminated states; failed values retain a failure id and reason, while `isAvailable()` narrows only the value-bearing state.

`AcademicWork` owns the cross-version bibliography and canonical citation version. `WorkVersion` owns one immutable version's type, date, provider records, content hash, predecessor, and validity state. Work, version, and research-brief ids come from random UUIDs rather than external identifiers. `externalIdentifierDedupKey()` encodes the admitted kind and normalized value without applying hidden normalization; a durable merge-audit record is not part of this package yet.

`ResearchBrief` owns one version of the user-reviewed research scope, publication window, evidence requirements, report requirements, resource ceilings, assumptions, and approval state. `isExecutableResearchBrief()` authorizes execution only when an approved record names the brief's current version; pending review, requested revision, and approval for an older version do not authorize work.

`EvidenceRecord` binds a verbatim excerpt and sourced statement to the actual work version, provider, retrieval time, extraction method, content hash, and one `SourceLocator`. The locator union distinguishes provider records, abstract ranges, PDF sections, paragraphs, tables, and figures without inventing a page when the source does not provide one. `EvidenceCard` fixes the six research-question, method, dataset, metric, finding, and limitation sections; each item requires at least one direct evidence id. `EvidenceSnapshot` records the immutable evidence identities, work versions, and content hashes used under one research-brief version.

Typed same-process values receive no redundant runtime validation. A later parser validates records only when they cross an untrusted or durable boundary.

## Consequences

Members B and C can compile against one vocabulary without importing each other's implementations. Provider-specific response fields stay in adapters, and report-specific presentation fields stay in analysis or UI packages. Shared model changes land through the model owner, reducing overlapping pull requests.

ProviderFailure, BatchResult, and CoverageSummary keep failure and coverage semantics independent of network adapters. A successful empty search is distinct from a failed operation. Batch construction preserves successful values alongside failures, and coverage construction rejects invalid counts or unexplained truncation. A null provider breakdown makes absent statistics explicit instead of inventing zero counts. RetrievalRun binds observed queries, coverage, works, and failures to a brief version. Its stage discriminates open records with null terminal fields from terminal records with a status and time. Cancellation remains distinct from failure and retains successful work. The model records facts without authorizing retrieval or implementing transitions. Claim records preserve analysis-time snapshots and explicit confidence reasons. Evidence links distinguish support, opposition, and background; assessments retain their method and reviewed evidence. Freshness is computed at consumption time rather than rewriting historical claims. Known changes take precedence over missing evidence, but both reasons survive. Missing hashes cannot establish equality. Freshness does not replace semantic review or report approval.

## Verification

Focused tests and a focused TypeScript check cover unchanged, stale, and unverifiable claims, immutable history, freshness precedence, retrieval brief binding, partial completion, cancellation, open/terminal record distinctions, batch success including empty results, partial and total failures, coverage count and truncation constraints, all five availability states, random shared ids, versioned work records, exact external-identifier deduplication keys, current-version brief approval, every source-locator variant, six-section evidence cards, and immutable evidence snapshots. The package participates in the Host TypeScript project; repository package-path generation, documentation gates, and bilingual pairing cover the group and package.

## Alternatives considered

- **Keep types in each member package** — rejected because equally named records would drift and require conversion at every handoff.
- **Put records in the workflow package** — rejected because evidence production and offline analysis need the model without mounting orchestration.
- **Implement the full v1 model in one change** — rejected because small accepted increments give B and C stable checkpoints and isolate interface review.
