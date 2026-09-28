# Agent Note: Academic full-text acquisition publishes per-candidate progress facts

Status: implemented

English | [中文](2026-09-28-academic-fulltext-progress-facts.zh.md)

## Problem

The Academic research progress format carries a paper's `fulltext_fetch` stage, but nothing in the
evidence package reported which candidate URL a paper was fetching or why a candidate failed. A client
could see a paper stuck in full-text acquisition without learning whether the failure was a non-2xx
response, a truncated body, an unsupported body kind, an unconfirmed article, a PDF parse error, a
timeout, or a transport failure. The workflow owns model-side progress; the acquisition facts exist only
inside `dsh-academic-evidence`, so it must publish them.

## Decision

`fetchAcademicFullText()` accepts an optional per-candidate observer. It publishes a `started`
observation when each candidate attempt begins and a `settled` observation carrying the candidate's
`success`, `failed`, or `cancelled` settlement, its shared `FailureCategory`, and, on success, the
accepted `bodyKind` (`html` or `pdf`). A caller's cancellation publishes `cancelled` before the
acquisition call rethrows. Observations carry no timestamp; the progress owner stamps them. Observer
exceptions are swallowed, because progress is observational and must not change the acquisition result.

A stable `EvidenceError` code maps to one category: `EVIDENCE_FULLTEXT_UNCONFIRMED` is
`fulltext_unavailable`, `EVIDENCE_FETCH_STATUS` is `upstream_error`, and
`EVIDENCE_FETCH_TRUNCATED`, `EVIDENCE_FETCH_BODY_UNSUPPORTED`, and `EVIDENCE_PDF_PARSE_FAILED` are
`parse_failed`; a timeout `DOMException` is `timeout`, and every other rejection is `network_error`.

Model-side facts stay with the workflow. The segment, attempt, timeout, output-incomplete, and
evidence-validation progress for one paper is mapped by the workflow's model adapter from its existing
durable records; `EvidenceGenerator` keeps its `(request) => Promise<EvidenceDraft[]>` signature. Web
discovery identification and per-reference verification live facts stay with the hybrid-retrieval
orchestration.

## Alternatives considered

**Report one fact after the whole acquisition call.** Rejected because a client could not show which
candidate URL is in flight or that an earlier candidate failed before a later one succeeded.

**Reuse the generator callback for full-text facts.** Rejected because acquisition happens before any
generator exists; the two stages have different owners and lifetimes.

**Return acquisition facts on the result instead of an observer.** Rejected because the caller needs each
attempt as it happens, not only after the paper settles, and because an optional observer keeps existing
callers and their results unchanged.

**Add the raw `EvidenceError` code to the observation.** Rejected because the progress protocol consumes
`FailureCategory`; the stable code stays inside the evidence package's own errors.

## Consequences

The workflow and its progress projection can show each full-text candidate, its outcome, and a category
without reaching into evidence internals, and the controller can settle a paper's `fulltext_fetch`
operation as running, failed, or succeeded. The evidence package gains one optional parameter and one
isolated observer path; omission preserves every existing call and result. The category mapping and the
accepted body kind are now producer-owned facts rather than client guesses.
