# Agent Note: Reviewed facts drive academic candidate ranking

Status: implemented

English | [中文](2026-09-30-academic-candidate-ranking.zh.md)

## Problem

Q3 yields verified, deduplicated works, but the shared model's P0/P1/P2 policy needs candidate classification, hard eligibility decisions, weighted scores, and a diverse queue. Provider metadata lacks reliable abstracts, keywords, method judgments, and decisions on the Brief's natural-language rules. Inferring those facts from title or venue alone would silently turn missing data into an eligibility decision.

## Decision

`rankPlannedCandidates()` consumes the approved Brief and Q2 plan, the Q3 round result, and exactly one reviewed `CandidateAssessment` per work. The assessment supplies abstract and keyword text, semantic fractions, contribution signals, question matches, rule decisions, full-text availability, diversity labels, and explanatory facts. The library computes date, work-type, retraction, and lexical hard filters; it does not parse natural-language rules. Missing rule decisions reject the ranking call.

The ranker converts unit-interval semantic fractions into the plan's eight weighted points, uses the shared score and priority helpers, and retains all component scores and reasons. It classifies from contribution signals and places every work in P0, P1, P2, or excluded. Within each non-excluded queue, the highest-scoring work leads; later positions prefer unseen source, first-author team, matched question, classification, and reviewed topic tags before score ties. Diversity changes order but never silently drops a candidate or changes its priority.

## Alternatives considered

**Infer semantic judgments from sparse provider metadata.** Titles and venues cannot establish method relevance, evaluation quality, full-text availability, or a natural-language exclusion rule.

**Ask a model for one final score and queue.** That would bypass the approved weights and hide the reason for a priority decision.

**Apply a fixed per-tag quota.** The Brief has no approved diversity quota; a hidden cap could discard otherwise eligible works.

## Consequences

The Academic controller can supply reviewed assessments and use the complete queues for Q5 batching while retaining responsibility for model calls and Session records. A missing or stale assessment fails before scheduling. The pure library adds no runtime service or model-visible input; the controller must record any assessment that later reaches the model or user.
