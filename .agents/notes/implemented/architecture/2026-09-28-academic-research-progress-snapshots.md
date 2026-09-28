# Agent Note: Academic research progress uses complete stage snapshots

Status: implemented

English | [中文](2026-09-28-academic-research-progress-snapshots.zh.md)

## Problem

An Academic research Remote call can spend substantial time in source retrieval, concurrent full-text acquisition, evidence extraction, analysis, and report synthesis while the client receives no intermediate state. A single estimated percentage cannot truthfully represent changing candidate totals, overlapping paper work, retries, or early evidence sufficiency.

## Decision

The Academic Research Controller exports a version-1 browser progress format. Every progress frame contains a complete snapshot identified by `RetrievalRunId` and a monotone sequence. A later sequence replaces an earlier snapshot, so a client does not need to replay deltas to reconstruct current state.

The snapshot carries retrieval, screening, full-text, extraction, analysis, and report stages separately. Each stage has producer-owned status, timestamps, completed items, an optional known total, and a count unit. `activeStages` can contain more than one stage because concurrent papers can fetch full text and extract evidence at the same time; `primaryStage` is only the headline stage.

The snapshot exposes observed counts, elapsed time, concurrent activities, one-based batch and attempt indexes, and sanitized failure codes. Ingestion counters distinguish consolidated work identities, records assigned to an existing work, retained versions, and unresolved suspected duplicates. Paper activities carry both `AcademicWorkId` and `WorkVersionId`; Provider activities carry one query position and one Provider settlement. It does not expose an estimated completion percentage or raw provider/model diagnostics. Stage settlement remains independent from aggregate counts, and validated evidence remains distinct from returned or rejected model drafts.

The exported `AcademicResearchRunFrame` contains progress frames and one final result frame. `academic-workflow` accepts an optional synchronous observer and emits complete run-local snapshots at the commit points for retrieval, screening, concurrent paper work, analysis, report generation and cancellation. Observer exceptions are contained because progress is observational. The workflow uses the ingestion package's audit summary for ingestion counters. It passes one run-local observer through the Controller adapter to Academic Source, stamps each Provider start and settlement with its query position and workflow clock, and publishes those facts as Provider activities. Model-internal batch and retry values remain null until their owning workflow adapter supplies them. `academicResearch.runStream` bridges the synchronous observer to one ordered, single-consumer Remote stream; closing the stream aborts that operation. The unary `academicResearch.run` remains temporarily for client compatibility, but it does not emit progress.

## Alternatives considered

**Infer progress from the terminal paper array.** Rejected because terminal arrays cannot describe active queries, concurrent papers, retries, or stages that completed before a downstream failure.

**Publish only incremental events.** Rejected because a client reconnect or missed event would need a separate replay protocol before it could render the current state.

**Publish an overall percentage.** Rejected because candidate totals can become known only after screening, and retries or evidence-based early stopping change the remaining work.

**Extend the coarse `ResearchStage` union.** Rejected because that type represents the run lifecycle, while retrieval, full-text, evidence, analysis, and report work can overlap and require independent settlements.

## Consequences

B can publish source, paper, batch, attempt, and evidence facts without choosing UI text. C can consume the real stream or continue building against fixed synthetic snapshots. Full snapshots repeat a bounded amount of state, but they simplify replacement and ordering. The workflow producer preserves completed sibling facts across paper failures and cancellation. The stream is deliberately one-shot: it provides neither automatic reconnection nor background execution, persisted progress, or recovery after the caller leaves.
