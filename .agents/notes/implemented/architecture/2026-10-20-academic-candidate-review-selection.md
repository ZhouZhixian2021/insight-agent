# Agent Note: Academic candidate semantic review parsing and review selection

Status: implemented

English | [中文](2026-10-20-academic-candidate-review-selection.zh.md)

## Problem

Candidate model review sent each work a full screening prompt and took the first eight lexically ranked works, so a limited budget clustered on one research question and long responses hit output limits. The minimal model exchange defined by `CandidateSemanticReviewRequestV1` and `CandidateSemanticReviewV1` had no parser or deterministic pre-model selection, and the model-review budget shared across initial and gap rounds was not distinguished from the Plan candidate ceiling.

## Decision

`parseCandidateSemanticReview(text, title, abstract, approvedQuestions)` reads only `schemaVersion`, `scope`, and `matchedQuestions`; matched questions must belong to the approved Brief, and every quotation must occur verbatim in the canonical title or scholarly abstract. Off-topic and unknown responses carry no matched questions, while a potentially relevant response requires at least one. Transport, timeout, truncation, and invalid JSON remain caller failures, never a model `unknown`.

`selectCandidateReviews(brief, plan, ranking, assessments, attemptedWorkIds, maximumModelReviews)` allocates the shared budget deterministically. Eligible candidates are those the ranking did not hard-exclude, with resolvable full text, that were not already attempted. It claims slots first for approved-question coverage derived from each candidate's `discoveredBy` routing, then fills remaining slots by lexical order: priority queue, provider-abstract availability, descending score, then canonical work identity. Attempted works consume budget even when their call failed, and routing never adds semantic match points. `CandidateReviewSelectionV1` reports `selected`, `not_selected_budget`, `hard_excluded`, `fulltext_unresolvable`, or `already_attempted` per candidate with zero-based `selectionOrder`, `routedQuestions`, and a `question_coverage` or `lexical_fill` reason.

`screeningFromSemanticReview(review)` projects a validated judgment into screening details, and `assessPlannedCandidates()` merges it with code-computed cues instead of letting a review replace them. Question matches remain the model's semantic conclusion; method, evidence-type, and contribution dimensions keep reviewed model indications when supplied or code-computed lexical cues otherwise, and a definitive off-topic conclusion credits none. Local surface keyword hits and uncertainties are always retained, so a semantic review never zeroes deterministic lexical clues or labels them as verified evidence.

## Alternatives considered

Reusing the first P0/P1/P2 slice keeps the current code but leaves question coverage to chance. Ranking only by score ignores that an abstract-free candidate needs a title-only judgment. Selecting inside the Controller would duplicate the rule; the pure library keeps the rule testable and transport with the caller.

## Consequences

The model-review budget is independent of the Plan candidate ceiling and the P0/P1/P2 queue sizes, and the caller removes any `Math.min` cap between them. Prior attempts reduce the remaining budget across rounds. The parsing and selection functions stay pure; Controller wiring, bounded concurrency, and versioned Session events remain A's responsibility.

## Verification

`tests/parse-semantic-review.spec.ts` pins accepted related, off-topic, and unknown judgments and rejection of extra fields, unapproved or duplicate questions, fabricated or unavailable-source quotations, and contradictory scope conclusions. `tests/select-reviews.spec.ts` pins coverage-before-fill, budget exhaustion, whole-budget prior attempts, canonical-identity tie-breaks, and loud failures for disagreeing approvals, ranking, assessments, and budget. `tests/rank.spec.ts` pins that a minimal review keeps code-computed cues for potentially relevant and unknown scopes, credits none for off-topic, and preserves local surface keyword hits.
