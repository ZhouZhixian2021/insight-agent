# Agent Note: Academic automatic report delivery

Status: implemented

English | [中文](2026-10-26-academic-automatic-delivery.zh.md)

## Problem

The workflow always requests a draft. Question-driven rendering refuses final output independently of evidence quality, mixing missing independent reviews, question gaps and mechanical failures.

## Decision

The workflow requests auto delivery. Evidence admission, citation, version, hash, excerpt, depth, independent-work counts, plan approval, confidence and conflict disclosure remain enforced. Required structure and non-synthetic data determine delivery. Report length is unrestricted, historical targetLength fields are ignored for delivery, and new plans declare null bounds. Synthesis instructions explicitly prohibit padding or truncating to a word count. Absent independent reviews and single-paper semantic review are not prerequisites; invalid or non-supporting supplied reviews still block. Question associations and model-proposed partial answers remain nonblocking content notices. No model call is added, and ready does not establish semantic approval.

Issues optionally carry delivery/content categories in the existing Remote. Markdown, the live panel and HTML export separate blockers from content limits. Historical reports retain their persisted modes and missing categories. Explicit final rejects failed checks; callers may still request drafts.

## Alternatives considered

Removing all checks would allow invalid citations and synthetic data into final reports. Another model judge adds latency outside this iteration. Renaming only the UI would misrepresent persisted results.

## Consequences

This partially supersedes mandatory-review delivery in [the report slice](2026-09-14-academic-report-slice.md), [question synthesis](2026-09-20-academic-question-synthesis.md) and [minimal reports](2026-10-15-academic-minimal-report-review.md); their evidence and analysis decisions remain active. Tests cover unreviewed delivery, nonblocking question gaps, retained integrity/count failures and ignored historical length bounds and separate UI sections. Existing Session reports are not rewritten.
