# Agent Note: Academic research in Chat

Status: implemented

English | [中文](2026-10-28-academic-chat-research.zh.md)

## Problem

A separate latest-run dialog detaches research from its originating question and makes subsequent approved plans difficult to distinguish from historical results.

## Decision

The C client contributes one academic-research Chat node per approved native or PTC plan invocation through the existing Conversation registry. Ordinary plans, pending reviews and rejected approvals do not authorize execution. The renderer uses the Controller's Session/approved-call Brief identity, reads the current approval and saved tasks, waits for the originating turn to complete normally and the framework Session to become idle, and rechecks approval before starting the existing background Remote. No composer, agent loop, source or workflow behavior is replaced.

Cards declare groupTree: turn and use the owning turn closing sequence so process folding cannot hide their status or results. Each card retains its own Brief filter, progress, evidence, original report and cancellation control. Persisted background state links the invocation to its exact task ID, so recovery does not depend on recent-list coverage. Revisiting a saved card reads the same task. Unmounting stops observation; only explicit cancellation ends research. Separate cards never substitute a newer plan or another run's report.

## Alternatives considered

A shared latest-result panel loses per-request ownership. Replacing message submission duplicates A's planning and approval flow. The standard Chat node extension retains the official composer and approved backend operations.

## Consequences

Current approved plans without a saved task receive one automatic admission attempt per mounted card. Response loss triggers discovery, and server admission remains authoritative across clients. A different running task blocks admission; the waiting card exposes refresh rather than inventing a queue. Interrupted tasks are never restarted automatically. Frontend admission requires the card to be mounted; this does not add a server-side approval trigger.

Focused replay and DOM tests cover two turns, native/PTC approval, rejected plans, separate reports, StrictMode, saved-task recovery outside the recent list, cancellation and observer disposal. The shipped Web dependency closure boots through the production Client Loader. Real-model end-to-end and browser visual recording are not covered by these fixed-material checks.
