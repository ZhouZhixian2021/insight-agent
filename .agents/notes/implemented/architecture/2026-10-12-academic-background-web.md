# Agent Note: Web observes Session-owned academic background tasks

Status: implemented

English | [中文](2026-10-12-academic-background-web.zh.md)

## Problem

A browser subscription cannot own a long research task: modal disposal and Session changes must not terminate server execution, and a reopened viewer needs the saved result rather than another research pass.

## Decision

The production form uses the Controller's background start, list, get, watch and cancel methods. It discovers Session records on mount, selects active work or the latest record, and permits selection of older records. An observation controller owns only admission and subscription lifetime. Explicit cancellation uses a separate command and waits for producer state; subscription disposal does not send that command. Admission-response loss triggers discovery before another start is permitted. Interrupted records do not resume automatically.

Each subscription binds Session, background task, retrieval run and Brief identities. Progress and Q6 sequences increase independently, with at most 20 locally observed progress entries. The viewer retains observations on disconnect and reloads by explicit user action. Server task completion, retrieval settlement and report review remain separate; a saved report stays viewable without current plan approval.

## Alternatives considered

**Restart execution to restore the page.** Rejected because it duplicates research and cost; restoration uses saved task state.

**Cancel whenever a subscriber disconnects.** Rejected because the server task and browser observer have separate owners.

## Consequences

The viewer needs no browser-local task persistence. Reload recovery depends on Session records and the Controller; an unavailable record listing prevents duplicate admission. Reconnecting reads saved state and never invokes checkpoint execution. The fixed lifecycle preview remains an explicitly synthetic demo.

## Verification

Focused client tests exercise remount recovery, modal disposal, Session switching, explicit cancellation, interruption, admission-response loss, subscription reload and stale response isolation. The existing real Loader/Web scenario closes and refreshes during external discovery, reopens the same task, and reads terminal results without another start. Its source providers are synthetic; it does not establish live-source or model quality.
