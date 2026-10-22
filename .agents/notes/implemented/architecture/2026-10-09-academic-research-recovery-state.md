# Agent Note: Academic research recovery state

Status: implemented

English | [中文](2026-10-09-academic-research-recovery-state.zh.md)

## Problem

Academic research already records the approved search plan, candidate-batch decisions, batch settlements, and terminal run settlement in Session events. The workflow had no public normalized boundary for replaying those facts. A future continuation path could therefore interpret completed batches, pending candidates, coverage, or terminal runs differently and accidentally repeat work.

## Decision

The Academic workflow exports a type-only `AcademicResearchRecoveryState` contract through `@deepseek-ai/dsh-academic-workflow/recovery`.

A successful reconstruction produces `AcademicResearchRecoveryInput`. It binds one RetrievalRun and one exact ResearchBrief version to the approved search plan, completed batch facts, scheduled candidates without a matching settlement, and the latest committed question coverage. Completed batches retain their original candidate order and settlement count. Pending candidates retain their batch number and decision order. The approved query identities and expressions are reused rather than regenerated.

The outer state distinguishes `resumable`, `completed`, `cancelled`, and `failed`. Completed and cancelled histories are terminal states, not failures. A failed reconstruction has no continuation input and uses a stable failure code plus a sanitized explanation. Failure text must not contain raw model responses or source documents.

A-S2 adds `reconstructAcademicResearchRecoveryState()` as a pure fold over one complete Session log. The caller supplies the exact RetrievalRun and ResearchBrief identity. The fold binds the nearest preceding search-plan event, pairs each scheduled batch with its later settlement, preserves one final unsettled batch, restores the latest committed coverage, and recognizes terminal settlement. It rejects repeated or non-contiguous batches, duplicate candidates, settlements without decisions, decreasing cumulative evidence, batch facts after terminal settlement, and Brief identity mismatches. New settlement events carry coverage; historical events without it remain readable with null coverage.

A-S3 adds a versioned, JSON-safe `AcademicResearchRecoveryCheckpoint` at every scheduled and settled batch boundary. The checkpoint retains the exact candidate handoffs, work/version state, ranking policy, Q5 observations, accumulated paper outcomes, failures, coverage and scheduler counters needed to continue. `AcademicResearchRunRequest.resumeRetrievalRunId` asks the Session-backed Controller to reconstruct the target run after `resolveAgent()` has acquired the Session write handle. The continuation skips retrieval and screening, preserves the original run identity and start time, does not repeat settled batches, and retries one scheduled but unsettled batch as the atomic commit unit. Historical incomplete runs without a checkpoint fail with `candidate_state_missing`; they are never replayed from incomplete identities or silently restarted.

## Alternatives considered

- Let the Controller resume directly from raw Session events. Rejected because event ordering and consistency rules would leak into every caller.
- Persist and deserialize the complete in-memory workflow object. Rejected because it contains implementation detail and would create a fragile storage format.
- Restart every interrupted run from the beginning. Rejected because completed network and model work would be repeated and stable query identities could change.

## Consequences

Session replay and continuation now share one versioned vocabulary. Invalid states cannot simultaneously carry continuation input and a recovery failure. Replay validates checkpoint identity, approved-plan compatibility, committed batch counts, pending batch identity and candidate payload completeness before continuation.

Only runs created after the checkpoint contract can resume. A crash before the first durable batch checkpoint, or a historical run containing decisions without executable candidate state, requires a new research run. Recovery intentionally disables a new evidence-gap search round because the persisted checkpoint does not retain source-runtime resolution caches; it may continue the retained ranked pool and reports a limitation if another retrieval round is required.
