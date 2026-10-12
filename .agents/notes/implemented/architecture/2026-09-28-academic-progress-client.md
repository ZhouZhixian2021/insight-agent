# Agent Note: Academic progress has one request owner

Status: implemented

English | [中文](2026-09-28-academic-progress-client.zh.md)

## Problem

The [progress snapshot contract](2026-09-28-academic-research-progress-snapshots.md) sends intermediate facts and a final result on one execution stream. Treating it as a reconnecting subscription could start duplicate research. A transport error does not establish a failed research outcome.

## Decision

The form observes Session-owned background tasks through `watchBackgroundRun`, using the [background Web lifecycle](2026-10-12-academic-background-web.md). Matching Session and run identities are required. Increasing sequences replace snapshots; recent observations retain at most 20 entries. Disposal ends observation only and prevents late updates from changing another form.

Six ordered stages, concurrent activities, batch and attempt facts, and observed elapsed time are rendered without deriving success from counts or inventing percentages. Cancellation and interruption retain the latest observed facts; neither reconnects automatically. Explicit Remote refusals have server-error wording, while generic internal or transport errors leave the outcome unconfirmed.

The browser imports progress types through the workflow's type-only `./progress` export. The Controller type import and matching TypeScript source alias use that leaf. Importing the workflow execution barrel pulls host Session augmentations into client tests and conflicts with ClientSessions; isolation fixes the dependency without changing progress fields or workflow execution.

## Alternatives considered

**Retry the stream on disconnect.** Rejected because each call starts a new research operation.

**Treat unknown totals as zero or elapsed time as completion.** Rejected because the producer has not supplied those facts.

**Duplicate shared types in the UI.** Rejected because consumers must follow the formal Remote contract.

## Consequences

The existing snapshot decision remains active; this note adds the client lifecycle and type-import isolation. Fixed-fixture tests cover concurrent activities and retries. A real Web Loader scenario replaces only external search sources, then verifies streamed retrieval and the no-evidence terminal result through the real Controller and workflow. It does not certify external network or model reliability. Background execution and restoration follow the linked lifecycle decision.
