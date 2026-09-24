# Agent Note: Academic hybrid presentation preserves producer facts

Status: implemented

English | [中文](2026-09-24-academic-hybrid-presentation.zh.md)

## Problem

The [hybrid retrieval contract](2026-09-22-academic-hybrid-retrieval-contract.md) distinguishes Web discovery, scholarly verification and deduplicated works. A generic success badge hides those distinctions, while an unchanged report download omits runtime limitations visible elsewhere in the interface.

## Decision

The Academic client renders approved per-query policies and terminal hybrid observations directly. Missing projections stay unknown; identified references remain unverified until a producer reports verification. Counts retain their units. Pending requests do not simulate stage progress. The main Web report preview and download preserve the returned body and append escaped retrieval disclosure. The browser imports only the report's presentation type and renders locally, keeping host execution outside the client bundle. Candidate links remain outside the bibliography, and disclosure cannot grant review approval or assert complete coverage.

The evaluation library accepts optional original admitted evidence. Identity, content and provenance must match before a cited record contributes to coverage. This input belongs to the trusted extraction producer; the evaluator does not establish trust from URLs or a model's declarations. Existing workflow callers do not yet provide it. Detailed host report disclosure and production admission wiring remain owner integration tasks, explicitly documented in the package READMEs.

## Alternatives considered

**Infer success from counts or official URLs.** Rejected because identification, verification and paper admission are separate operations and use different units.

**Import Controller types into report and evaluation.** Rejected because the Controller already depends on the workflow and report. The report owns a localized presentation input; the client adapts the formal Remote projection without changing shared models.

**Replace the server report with a browser-generated report.** Rejected because producer content and quality must remain intact. A labeled appendix records runtime facts without inventing claims.

## Consequences

Owner-local tests consume A's synthetic fixture and exercise legacy omissions, verification outcomes, coverage disclosure, substituted snippets and report eligibility. Synthetic presentation tests do not establish real-source success. The existing hybrid contract remains active; this decision adds its client consumer and does not supersede its shared interfaces.
