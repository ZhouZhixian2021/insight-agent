---
kind: upgrade-guide
description: "Academic background readers must restore candidate-sharing Q6 updates; slow live watchers keep only the latest pending view."
---

# Read Academic background progress events

English | [中文](guide.zh.md)

## Change

Academic background research keeps the existing required `academic/background-run-progress` payload for ordinary progress. The new required `academic/background-run-q6-update` event carries the same progress fields plus complete Q6 metadata without `candidates`. It applies when the Session/run/Brief binding and candidate contents match the complete base, including newly created but equal candidate objects. Readers inherit candidates from that base. Initialization, candidate-content changes, binding or retrieval-ID changes, cancellation intent and terminal settlement still write complete `academic/background-run-state` checkpoints with the original `schemaVersion: 1` payload.

Current readers fold all three event types into the same complete Remote view, retaining every durable progress update. Legacy full checkpoints and old progress events remain readable. Readers that recognize only the old progress tag reject the new required Q6-update tag. The Academic projection cache state version is 3; the Session writer format remains 4. The [compatibility record](../../../persistence-changes/2026-10-26-academic-background-progress.md) describes both required lightweight events.

Each live watcher retains only its latest unconsumed view. Slow watchers may skip intermediate live frames; durable events are preserved. A pending terminal view is delivered before completion, and abort removes the observer and pending view without cancelling research.

Existing logs are not rewritten or compacted. This change removes content-equal candidate duplication, but does not bound frequent candidate-content changes. Peak memory when reopening oversized histories and long-running real Web acceptance remain unverified.

## Migration

1. Upgrade every application or custom reader before writing new background updates. Readers must handle both required lightweight tags, restore Q6 metadata against the matching complete base, and inherit its candidates; see the [controller contract](../../../../packages/api/academic-research-controller/README.md).
2. Preserve existing Session files. Legacy `academic/background-run-state` records retain their original meaning and remain readable; no historical rewrite is required. Do not delete the new events, mark them ignorable or alter the Session header to force an older reader to accept them. Keep a pre-upgrade copy if rollback to an older reader is required.
3. Confirm legacy-only and mixed histories restore the latest progress, Q6, cancellation intent and terminal result. Check slow live watchers against the latest-view delivery contract, rather than expecting every intermediate frame. Remote full-view types, model parameters and user-facing wording do not require migration.
