# Agent Note: Evidence narrative report delivery

Status: implemented

English | [中文](2026-10-28-academic-evidence-narrative.zh.md)

## Problem

Direction hierarchies turn a small comparison into many headings and paragraph jumps. Fixed-material experiments separate C writing changes from slow retrieval and variable upstream evidence.

## Decision

New synthesis prompts select B-style question-focused prose, section responsibilities and concise citations, borrowing writing principles from PaperQA, STORM and GPT Researcher. They retain the approved input, existing statement/reference validation, Claim construction and one existing synthesis stage. The analysis-owned optional writingStyle: evidence_narrative marker selects the new renderer; it adds no shared Academic Model or Controller fields.

The renderer expands a statement once, omits duplicate placements, shows actual result text and conditions in tables, and keeps scope and uncertainty beside arguments. Scope and question checks follow the narrative; full excerpts and identities remain in the appendix. Evidence admission, independent-work checks, synthetic-data restrictions and delivery decisions are unchanged. Historical unmarked drafts retain their layout.

Private fixed-material tooling exports and replays C inputs and records exact input sources. The initial authored examples and two real DeepSeek calls are explicitly distinguished. Both real treatments use the same 40 evidence records, model route and settings; citation choices are outputs. Unknown model references are quarantined without guessed repairs. Private Sessions, raw model outputs and report files remain outside Git.

## Alternatives considered

HTML-only styling cannot fix excessive report structure. Replacing the full pipeline with an upstream Python project changes source and workflow ownership. Adding multiple summarization or polishing calls increases latency; the adopted writing instructions use the existing synthesis call. Hand-fixing model citations would hide an experimental failure.

## Consequences

This partially supersedes the default writing decision in the [direction report note](../architecture/2026-10-12-academic-direction-report.md); its historical parser, direction checks and bibliography remain supported. Owner-local narrative snapshots and SDK request snapshots cover the new prompt and output. The two real samples establish executable comparisons, not statistical superiority or independent semantic approval. Browser visual and print acceptance remain incomplete. Chat placement and continuous research are outside this change.
