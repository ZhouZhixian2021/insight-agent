# Agent Note: Bound candidate model review after lexical ordering

Status: implemented

English | [中文](2026-10-19-bounded-academic-candidate-review.zh.md)

## Problem

One approved query can return many hard-eligible works, while the final candidate limit applies only after ranking. Reviewing every work serially with the Session model makes candidate screening scale with discovery volume. A model that spends most output tokens on reasoning can consume the 150-second attempt limit before emitting a small review JSON object. The screening stage then appears unchanged throughout the calls.

## Decision

The Controller builds deterministic assessments and rankings before model calls, then uses the [pure review selector](2026-10-20-academic-candidate-review-selection.md) to allocate question coverage before lexical fill. `candidateReviewMaximumWorks` defaults to 8 across initial and evidence-gap rounds, independently of the Plan candidate ceiling. `candidateReviewConcurrency` defaults to 1 and accepts 2 as an explicit deployment override. Workers share one ordered queue, stop taking work after cancellation or fatal logging failure, and drain in-flight calls before returning. Completed outcomes are merged by canonical work identity in selection order. Recoverable model failures retain successful siblings and lexical assessments.

The model receives only approved topic, distinct questions, scope rules and canonical scholarly title/abstract, and returns scope plus quoted question matches. The Controller records selection, exact request, settled stream and verified judgment under separate versioned Session event names; historical screening events remain readable. Only a durable validated judgment reaches scoring. Dispatch consumes the shared budget, including failed calls; pre-dispatch cancellation and admission rejection do not. `CandidateAssessment.semanticReview` records validated scope, uncertainty, failure code or non-selection reason and is retained by Q6 and recovery checkpoints. Historical assessments may omit it. Existing review progress counts remain independent of deduplicated-work totals.

## Alternatives considered

**Increase the per-attempt timeout or output-token cap.** This does not bound the number of serial calls and can increase latency when the model keeps generating reasoning before its review JSON.

**Treat low lexical scores as hard exclusions.** This would prevent a model from rescuing a relevant paper with sparse or multilingual metadata. Eligible low-scoring works remain available to the coverage selector and lexical fill.

**Count skipped works as model-reviewed.** This would conceal the quality difference between semantic indications and lexical fallback. The assessment and progress view state the difference explicitly.

## Consequences

The number of semantic model calls is bounded across a run, even when the Academic source returns more raw records. The tradeoff is that a relevant work below the review budget may keep a lower lexical score and miss the final candidate cap. Operators can change the deployment bound, while the approved candidate limit remains authoritative. A single review may still take up to `candidateReviewAttemptTimeoutMs`; this decision does not alter the selected model's reasoning behavior or guarantee a fixed total runtime.

The [fixed scoring handoff](../../../../z-team_docs/验收数据/2026-10-20-candidate-review/scoring-handoff/manifest.json) retains approved inputs and verified judgments beside recorded assessments and queues. Its keyless replay uses the production pure functions and preserves canonical identities and each run's discovery-query associations. Candidate question matching remains separate from evidence-supported coverage; replay agreement is not independent relevance evaluation.

The [complete retained-pool handoff](../../../../z-team_docs/验收数据/2026-10-20-candidate-review/full-pool-handoff/manifest.json) separates actual historical dispatch from current-code selection replay. It retains canonical metadata, every retained version identity, hard-filter reasons and budget-skipped works. Missing raw provider responses, noncanonical metadata and historical selection events stay explicit gaps. This permits omission review without new model calls; routing coverage alone cannot establish relevance or rule out omissions.
