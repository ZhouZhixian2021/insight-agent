# Agent Note: Minimal reading prioritizes question matches and bounds size recovery

Status: implemented

English | [中文](2026-10-14-academic-fragment-priority-recovery.zh.md)

## Problem

An early source section can consume the minimal evidence cap before later sections address other questions. Repeating a size-related failure on every full-sized group spends calls without adding evidence; retrying an irreducible failed range spends the same input again.

## Decision

Minimal extraction orders packed ranges by lexical matches, choosing a next match for each approved question in turn. Caller-supplied `questionTerms` keeps approved cross-language aliases outside the evidence model; omitted hints use question words. Unmatched ranges remain available in source order. Matching changes dispatch priority only. The original text, locators, offsets and packed-group identities remain authoritative, and only source-verified drafts produce evidence and question links.

After a timeout, parse failure or incomplete output, subsequent groups in the same minimal extraction call start with the existing bounded split. All children retain their original group's attempt budget. An irreducible failed range becomes incomplete while queued siblings and later groups continue. Transport retries retain the input and backoff. Complete extraction keeps its dispatch and retry rules. Scope admission, model selection, logging and report eligibility remain caller-owned.

The [minimal evidence decision](2026-10-14-academic-minimal-evidence-depth.md) continues to own verified-record retention and the paper-wide cap. This decision supplies its reading priority and recovery policy without changing shared Academic Model or Session records.

## Alternatives considered

**Discard ranges without a lexical match.** Rejected because aliases may be absent or wording may differ; a missing word match does not prove irrelevance or a coverage gap.

**Add another model selection call.** Rejected because approved lexical hints can order the existing requests, while model routing and durable requests belong to the workflow.

**Apply learned sizes globally or retry identical irreducible input.** Rejected because one paper's failure does not calibrate another paper, and an unchanged size-related request adds no smaller-input recovery.

## Consequences

The fixed priority case retains the same five records with three dispatches rather than four. Fixed timeout, parsing and incomplete-output cases retain the same four records with five dispatches rather than six. These fixtures measure calls, not real-model latency, billing or semantic quality. Lexical priority can miss paraphrases and cannot guarantee every approved question is answered before the cap. Callers must supply approved aliases, disclose absent question links and treat group identities separately from chronological call counts. Workflow activation, real-model calibration and independent review remain separate work.

## Verification

Focused tests cover cross-language hints, shared matches, stable fallback order, invalid hint alignment, smaller subsequent groups, irreducible failures, transport retries and preservation of committed evidence. Existing fragment tests retain cancellation, sink failure, attempt limits and complete extraction. The affected fragment module has 100% statement, branch, function and line coverage.
