# Agent Note: Academic ranked candidate batch scheduling

Status: implemented

English | [中文](2026-09-30-academic-ranked-candidate-batch-scheduling.zh.md)

## Problem

Q4 returns complete, ordered P0/P1/P2/excluded queues, but the existing draft pipeline processes one metadata-selected pool without a shared, replayable decision for the first full-text batch, question-gap replenishment, or terminal stop reasons. Re-ranking inside the workflow would duplicate B's ownership and make Session recovery nondeterministic.

## Decision

Academic Workflow exposes `planCandidateBatch()` as a pure Q5 decision boundary. Its input binds the exact approved ResearchBrief, HybridSearchPlan, Q4 ranking, question coverage, caller-configured batch sizes, already scheduled version IDs, completed batch and search counts, consecutive no-evidence batches, included works, and terminal run facts.

The first batch preserves Q4's P0 order. Later batches preserve the combined P0/P1/P2 order while first selecting candidates whose `matchedQuestions` overlap uncovered or partial Brief questions. If the target still needs works or non-question evidence requirements remain unmet, the scheduler replenishes from the remaining authoritative order. It never consumes excluded candidates and never changes scores, priorities, or diversity order.

When no ranked candidate can fill a remaining need and search budget remains, the scheduler returns the exact missing Brief questions as an evidence-gap search request. Query generation remains B's responsibility. Stable stop decisions cover target and coverage completion, inclusion limit, saturation, search and candidate limits, elapsed time, cancellation, review, and exhaustion.

Batch sizes are required caller policy. Saturation and resource limits remain approved ResearchBrief or HybridSearchPlan values. The Controller persists the exact approved plan as `academic/search-plan`, each scheduling decision as `academic/candidate-batch-decision`, each batch settlement as `academic/candidate-batch-settlement`, and the terminal run as `academic/run-settlement`. Reading those events back to resume a run remains a later Q5 step.

## Consequences

A can schedule Q4 IDs without importing B's ranking implementation. B can generate a new query from explicit uncovered questions without owning workflow state. C can explain the same batch reason and stop reason without recalculating either. Replaying the same persisted inputs produces the same decision.

Version-3 Controller runs now preserve reviewed query provenance, obtain the Q4 ranking, map scheduled `WorkVersionId` values to resolvable full-text candidates, settle each batch, rebuild question coverage from validated evidence, and call the scheduler again. Legacy plans without retrieval policy retain their previous selection path. Approved rounds and evidence-gap rounds now use Academic Retrieval's `executePlannedSearchRound()` as their single query-settlement, provenance, and ingestion owner; the Controller projects that result into the existing workflow contract before `rankPlannedCandidates()` re-ranks and scheduling continues. Without a `replenishCandidates` adapter the pass still ends with the visible limitation. Run resumption from the persisted events remains deferred.

## Verification

Focused workflow tests cover P0 first-batch order, uncovered-question replenishment, evidence-gap search, a gap round driven through the replenishment adapter, saturation, and real pipeline stopping after a batch satisfies target and question coverage. Controller integration tests cover verified full-text reuse and ensure unresolved candidates do not consume a bounded processing slot. Package type checking and linting cover the public entry.

## Alternatives considered

**Let Workflow recompute candidate scores.** This would create a second ranking policy and could disagree with B's explanations.

**Process every ranked candidate at once.** This would spend full-text and model budget before coverage can stop or redirect the run.

**Generate gap queries in Workflow.** The workflow only identifies the exact missing questions; query expansion remains in Academic Retrieval so provider-neutral planning has one owner.
