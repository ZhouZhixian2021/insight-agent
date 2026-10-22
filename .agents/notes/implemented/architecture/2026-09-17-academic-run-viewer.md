# Agent Note: Session-backed Academic run viewer

Status: implemented

English | [中文](2026-09-17-academic-run-viewer.zh.md)

## Problem

A completed request, successful retrieval and report approval describe different facts. The Web entry must present the formal AcademicResearchRunValue without manufacturing progress or mixing results between Sessions.

## Decision

The [client plugin](../../../../packages/client/ui-academic-research/README.md) registers a research form in sidebar.footer.action. The framework useSessions selector supplies the selected saved Session. The form submits a trimmed query, synthetic: false and an AbortSignal through an injected callback; the [Remote assembly](../../../../packages/api/remotes/README.md) mounts the generated Academic contribution. The Controller owns approved-brief and model prerequisites. The multiline field preserves internal newlines in query and explains the three-query maximum and approved-plan limit; parsing and enforcement remain server-owned. Coverage copy includes an early stop or limited retrieval rather than attributing every truncation to a count bound.

Each mounted Session form owns one AbortController. Running, error and settled views follow request settlement. Closing, switching Sessions or unloading aborts the operation; request identity suppresses late updates after disposal. User cancellation aborts the carrier and waits for settlement. If a final value arrives, the panel preserves it; if cancellation rejects without a value, the page explicitly reports the absent server result. No report is fabricated. Samples and scenario derivation live only in tests.

The result panel displays lifecycle, retrieval and quality separately, reads coverage directly, and keeps source and paper failures distinct. Null providerBreakdown produces an unavailable message. Existing evidence navigation, filtering and Markdown download consume the returned report.

## Alternatives considered

A temporary intersection with RetrievalRun would duplicate a field already owned by the official result. A scenario selector in the production entry would substitute invented results for live work. Treating abort as a server completion would claim information the transport has not returned.

## Consequences

Results remain component-local and disappear on close or Session change. The entry offers no progress stream, automatic retry, recovery or approval action. The [report baseline](2026-09-14-academic-report-slice.md) retains responsibility for analysis and evaluation semantics.

## Verification

Owner tests cover returned results, structured failures, cancellation, duplicate submission, close, Session changes and late settlement. The keyless browser test boots the shipped Web composition, creates a real Session and verifies its actual Controller prerequisite error through the Remote path without issuing model calls. This validates transport integration, not a live-provider full research benchmark.
