# Agent Note: Lifecycle preview separates run state from viewing connection

Status: implemented

English | [中文](2026-10-10-academic-run-experience-preview.zh.md)

## Problem

The Q7.4 follow-up requires a page that explains a long run, partial evidence and reconnection. The current Remote execution stream cancels its task when consumption ends, so a client-only rewrite cannot promise durable background execution.

## Decision

Phase one adds a fixed JSON lifecycle preview within the explicit Q6 demo. The parent entry owns preview records across modal unmounts. Closing or switching records changes only viewing connection; explicit local demo cancellation changes run status and records its known source. Reopening reads the same record and existing draft without creating a request or generating a report. Refresh and plugin disposal reset this local prototype.

The preview shows stage input/output units, reason text, separate run and connection states, cancellation provenance, limitations and draft availability. Unknown counters and stage durations remain unknown. The incident's 70 discovered records, 30 candidate limit, 20 scheduled papers, 12 evidence records and two partially usable papers are not collapsed into confirmed final inclusions. Synthetic report downloads have a distinct filename.

## Alternatives considered

**Detach the existing real run from its AbortSignal.** Rejected because the server owns stream termination and no background subscription interface exists yet.

**Reset records whenever the modal closes.** Rejected because it prevents phase-one tests of reopening and retained results.

**Infer cancellation source or missing stage counts.** Rejected because the incident did not record those facts.

## Consequences

The [live stream lifecycle](2026-09-28-academic-progress-client.md) and [Q6 isolation decision](2026-10-09-academic-q6-readonly-preview.md) remain active. This local prototype neither supersedes them nor changes real requests. Fixed-data tests and one real Web Loader scenario verify reopening, separate connection state, explicit cancellation, retained drafts and no Remote calls. Phase two requires A's authoritative background run interface before connecting these interactions to real runs.
