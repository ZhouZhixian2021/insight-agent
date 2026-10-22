# Agent Note: Academic hybrid presentation preserves producer facts

Status: implemented

English | [中文](2026-09-24-academic-hybrid-presentation.zh.md)

## Problem

The [hybrid retrieval contract](2026-09-22-academic-hybrid-retrieval-contract.md) distinguishes Web discovery, scholarly verification and deduplicated works. A generic success badge hides those distinctions, while an unchanged report download omits runtime limitations visible elsewhere in the interface.

## Decision

The Academic client renders approved per-query policies and terminal hybrid observations directly. Missing projections stay unknown; identified references remain unverified until a producer reports verification. Counts retain their units. Pending requests do not simulate stage progress. The workflow supplies completed retrieval facts and approved query budgets to the host report renderer. Reports mark an included appendix with `retrievalDisclosureIncluded: true`; Web preview and download retain that Markdown verbatim and only append escaped disclosure when the marker is absent. The browser imports only the report's presentation type and renders locally, keeping host execution outside the client bundle. Candidate links remain outside the bibliography, and disclosure cannot grant review approval or assert complete coverage.

The evaluation library accepts optional original admitted evidence. Identity, content and provenance must match before a cited record contributes to coverage. This input belongs to the trusted extraction producer; the evaluator does not establish trust from URLs or a model's declarations. The workflow independently clones accepted records at source-checked extraction settlement, before any synthesis adapter receives the working evidence graph, and supplies that original batch to report evaluation. A modified working record cannot modify the reference batch. Full-text candidates and failures from scholarly verification remain scoped to the source record and current run; identity verification stays successful when candidate resolution fails. Such failures use `resolve_fulltext` in retrieval failures and the existing reference message, without changing reference counts.

Scope review receives the program-owned scholarly source provider and source URL alongside paper segments. It may use that metadata to satisfy an approved stable-identifier or official-source rule without requiring the extracted body to repeat the identifier. The metadata does not support research claims; excerpts remain the only model-extracted evidence.

## Alternatives considered

**Infer success from counts or official URLs.** Rejected because identification, verification and paper admission are separate operations and use different units.

**Import Controller types into report and evaluation.** Rejected because the Controller already depends on the workflow and report. The report owns a localized presentation input; the client adapts the formal Remote projection without changing shared models.

**Replace the server report with a browser-generated report.** Rejected because producer content and quality must remain intact. A labeled appendix records runtime facts without inventing claims.

## Consequences

Owner-local tests consume A's synthetic fixture and exercise legacy omissions, verification outcomes, coverage disclosure, substituted snippets and report eligibility. Synthetic presentation tests do not establish real-source success. The existing hybrid contract remains active; this decision adds its client consumer and does not supersede its shared interfaces.
