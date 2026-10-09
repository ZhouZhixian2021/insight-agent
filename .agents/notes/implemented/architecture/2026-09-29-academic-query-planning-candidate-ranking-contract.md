# Agent Note: Academic query planning and candidate ranking contract

Status: implemented

English | [中文](2026-09-29-academic-query-planning-candidate-ranking-contract.zh.md)

## Problem

Query generation, candidate ranking, workflow scheduling, and Web explanation need one provider-neutral handoff. Without shared identities and result shapes, retrieval and product packages would define incompatible query, priority, coverage, and stop semantics.

## Decision

Academic Model owns the Q1 contract but no query or ranking implementation. A `HybridSearchPlan` binds provider-neutral Academic, Web-discovery, and site-restricted queries to one exact approved ResearchBrief version. Every planned query has a `SearchQueryId`; verified citation expansion instead names the seed work version. Query and coverage records retain exact Brief question strings because ResearchBrief currently has no question identity, and Q1 does not revise approved Brief history.

`InclusionTargets` separates the minimum delivery floor, desired target, and absolute maximum. `ACADEMIC_CANDIDATE_RANKING_POLICY_V1` centralizes the approved 100-point weights and P0/P1/P2 thresholds. The ranker consumes Q3's works, canonical versions, and query provenance directly instead of copying them into another input record. The shared `CandidateAssessment` adds trusted provider abstract and keyword availability, semantic fractions, reviewed rule decisions, and a Controller-produced full-text resolution fact. Web discovery snippets never supply academic text. Unresolved and unknown full-text states remain distinct from confirmed resolution.

Candidate results expose hard-filter reasons as stable codes with optional reviewed details, plus classification, every weighted component, final priority, matched questions, diversity tags, and non-empty decision reasons. `AcademicCandidateRankingResult` binds those evaluations to the exact Brief version and returns every work version once through authoritative ordered P0/P1/P2/excluded ID queues. Hard exclusion always produces the excluded priority regardless of score. Shared helpers validate target ordering, query provenance, score ranges and totals, priority assignment, reviewed questions, and queue membership; they do not classify or score papers.

Question coverage names supporting works, evidence, and remaining gaps for each exact Brief question. Search rounds and stop decisions distinguish continued work from a terminal reason. The draft progress event carries monotone sequence, current phase, round/query/batch/work identity, observed funnel counts, question-coverage counts, and an optional terminal reason. It never carries an estimated percentage.

The existing runtime workflow remains unchanged in Q1. B owns query generation and candidate evaluation, A owns later batch scheduling and stop evaluation, and C owns the explanation and progress UI. A fixed synthetic sample is the common executable handoff for those packages.

## Consequences

B and C consume one assessment and ranking-result vocabulary without repackaging Q3 records. A prepares reviewed assessments and later consumes queue IDs without importing B's implementation. Scoring and threshold changes must be expressed as an explicit policy rather than scattered constants. Adding stable question identities would require a separately reviewed ResearchBrief schema change. Runtime Session events, persistence, model-assisted semantic classification, and replenishment remain later work.

## Verification

Focused Academic Model and Academic Retrieval tests validate query identities, inclusion-target ordering, score calculation and exact priority boundaries, malformed policies, exact-question references, complete unique queue membership, hard-filter codes, and deterministic queue ordering. Package type checking and linting cover every public export.

## Alternatives considered

**Declare types in retrieval and Web packages.** This would duplicate semantics across B and C and make A translate between competing shapes.

**Add question IDs to ResearchBrief in Q1.** Stable question identity may be useful later, but changing approved Brief records is wider than the shared handoff required here.

**Put the ranking algorithm in Academic Model.** The model should validate visible values and policy invariants; deterministic classification and ranking remain B's responsibility. A later model-assisted classifier would require a separately reviewed adapter and durable model-call record.

**Let B read Controller services directly.** That would couple the pure ranker to provider topology and make A's scheduler unable to replay the same candidate facts. The Controller instead resolves full-text availability before calling the ranker.
