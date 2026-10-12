# Agent Note: Academic research runs outlive their viewers

Status: implemented

English | [中文](2026-10-12-academic-background-run.zh.md)

## Problem

The existing `runStream` uses the Remote caller's AbortSignal for the research operation. Closing the modal, switching Sessions, or losing the browser connection therefore cancels a long research pass. A viewer cannot reopen its terminal result or identify whether a cancellation came from an explicit user action.

## Decision

The Academic Research Controller owns a separate background task identity scoped to one Session. `startBackgroundRun` validates the approved Brief and persists the initial state before executing the existing workflow under a task-owned AbortController. Progress, Q6 projection, cancellation intent, and terminal result are appended as complete `academic/background-run-state` Session events. `listBackgroundRuns` returns bounded discovery rows; `getBackgroundRun` reads the complete latest view. `watchBackgroundRun` sends the current view and later changes, and aborting its subscription leaves the task alone. Only `cancelBackgroundRun` issues a user-requested abort.

The background ID is distinct from the workflow's `RetrievalRunId`, which becomes available with the first progress observation. One active background task is allowed per Session. Graceful Host disposal records `service_stopped`, aborts each task and waits for settlement. An unfinished Session log reopened without an active task is reported as `interrupted` with its last durable observation; an abrupt stop carries no inferred cancellation source. Existing checkpoint recovery is a separate explicit run and may repeat an unsettled batch. The legacy `run` and `runStream` entry points keep their caller-owned lifetime.

## Alternatives considered

**Make `runStream` ignore its caller signal.** Rejected because existing clients rely on that call's cancellation behavior, and a disconnected stream would not provide discovery or terminal retrieval.

**Keep state only in a host map.** Rejected because a page refresh or host restart would lose the run ID, progress, and completed report.

**Automatically resume an interrupted task.** Rejected because the current checkpoint recovers at batch boundaries, not an arbitrary model call; automatic replay could repeat an unsettled batch without the user's knowledge.

## Consequences

A viewer can leave and reconnect to the same live task, and a completed report remains readable from the Session. Session events contain complete snapshots and terminal data, increasing log size; the discovery list returns only small summaries. A host restart cannot keep an in-process task alive and reports `interrupted` rather than inventing a cancellation source. The production Web page still calls `runStream`; the [fixed-data lifecycle preview](2026-10-10-academic-run-experience-preview.md) can migrate to these operations without redefining run state.
