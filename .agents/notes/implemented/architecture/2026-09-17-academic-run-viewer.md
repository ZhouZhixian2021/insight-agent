# Agent Note: Fixed-data Academic run viewer

Status: implemented

English | [中文](2026-09-17-academic-run-viewer.zh.md)

## Problem

The Academic Remote does not yet expose the retrievalRun agreed in A's handoff. A completed Promise, successful retrieval and report approval describe different facts; a report-only viewer hides partial failures and coverage limits.

## Decision

The [client plugin](../../../../packages/client/ui-academic-research/README.md) registers an explicitly synthetic sample viewer in sidebar.footer.action. A local RunValue combines the existing Remote result with the shared RetrievalRun, without modifying either producer type. A source fixture copies the handoff expectedValue and an equality test detects drift.

The panel receives caller-owned view data and a cancellation callback. The shipped sample entry only switches fixed local scenarios; it issues no Remote request, progress timer or model call. Pending views show waiting and cancel. Settled views display lifecycle, retrieval and report quality independently, read coverage directly, keep source and paper failures distinct, and preserve cancelled partial results without a report. Null providerBreakdown produces an unavailable message.

## Alternatives considered

Calling the current Remote and filling absent coverage from papers would invent source facts. Changing the Controller type in C's work would violate the producer ownership. Both are deferred to A's integration; the local adapter can be removed when the official result matches the handoff.

## Consequences

The sample viewer has no Session persistence, server cancellation or semantic approval action. The legacy standalone report renderer remains internal. The [earlier report baseline](2026-09-14-academic-report-slice.md) still owns analysis and evaluation semantics; this decision adds the Web slot and run-result presentation.

## Verification

Owner tests cover handoff equality, status separation, empty and incomplete evidence, safe text, filtering, exact Markdown download and plugin disposal. A keyless browser test boots the shipped Web Loader composition and exercises the actual sidebar entry, evidence and sample cancellation. Generated Controller schemas need zod at runtime; its missing dependency is declared without changing Controller types or behavior.
