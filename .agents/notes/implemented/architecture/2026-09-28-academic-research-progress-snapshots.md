# Agent Note: Academic research progress uses complete stage snapshots

Status: implemented

English | [中文](2026-09-28-academic-research-progress-snapshots.zh.md)

## Problem

An Academic research Remote call can spend substantial time in source retrieval, concurrent full-text acquisition, evidence extraction, analysis, and report synthesis while the client receives no intermediate state. A single estimated percentage cannot truthfully represent changing candidate totals, overlapping paper work, retries, or early evidence sufficiency.

## Decision

The Academic Research Controller exports a version-1 browser progress format. Every progress frame contains a complete snapshot identified by `RetrievalRunId` and a monotone sequence. A later sequence replaces an earlier snapshot, so a client does not need to replay deltas to reconstruct current state.

The snapshot carries retrieval, screening, full-text, extraction, analysis, and report stages separately. Each stage has producer-owned status, timestamps, completed items, an optional known total, and a count unit. `activeStages` can contain more than one stage because concurrent papers can fetch full text and extract evidence at the same time; `primaryStage` is only the headline stage.

The snapshot exposes observed counts, elapsed time, concurrent activities, one-based batch and attempt indexes, and sanitized failure codes. It does not expose an estimated completion percentage or raw provider/model diagnostics. Stage settlement remains independent from aggregate counts, and validated evidence remains distinct from returned or rejected model drafts.

The exported `AcademicResearchRunFrame` reserves a progress frame and a final result frame. The current `academicResearch.run` method still returns only its final value; workflow event production and the Remote stream are separate integration work.

## Alternatives considered

**Infer progress from the terminal paper array.** Rejected because terminal arrays cannot describe active queries, concurrent papers, retries, or stages that completed before a downstream failure.

**Publish only incremental events.** Rejected because a client reconnect or missed event would need a separate replay protocol before it could render the current state.

**Publish an overall percentage.** Rejected because candidate totals can become known only after screening, and retries or evidence-based early stopping change the remaining work.

**Extend the coarse `ResearchStage` union.** Rejected because that type represents the run lifecycle, while retrieval, full-text, evidence, analysis, and report work can overlap and require independent settlements.

## Consequences

B can publish source, paper, batch, attempt, and evidence facts without choosing UI text. C can build the progress interface against fixed synthetic snapshots before the live producer exists. Full snapshots repeat a bounded amount of state, but they simplify replacement, ordering, testing, and later reconnect support. This format does not provide background execution, persisted progress, reconnect recovery, or a live stream by itself.
