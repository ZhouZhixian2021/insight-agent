# Agent Note: Question-focused reading keeps producer evidence immutable

Status: implemented

English | [中文](2026-10-12-academic-question-evidence-reading.zh.md)

## Problem

Traceable quotations alone do not explain their relevance to a research question. Repeated excerpts can crowd out complementary findings, and different datasets can be mistaken for contradictory results. A correct citation identity does not establish semantic support.

## Decision

The [PaperQA2 algorithm](https://github.com/Future-House/paper-qa#paperqa2-algorithm) motivates question-conditioned evidence reading; this implementation keeps the existing single synthesis pass and does not adopt its search or reranking pipeline.

Analysis adds a private evidence-reading guide to the existing synthesis request. Producer card sections identify content roles; they do not assign relevance or support. Exact-source duplicate groups retain every ID and require matching work, version, locator, provider, URL, depth, hash and original excerpt. Full and compact prompts use admitted evidence. Compact recovery preserves card conditions and measurement context. The model chooses representative evidence, explains question contribution in existing link rationale, and distinguishes comparable results, differing conditions, potential disagreement and unknown comparability. No input schema, model-call stage or shared type changes.

Reports group existing support, opposing and background links, display escaped original excerpts and source identities beside retained arguments, and disclose absent opposing links as unknown. Quotations and repeated placements do not count as analytical body length. Rendering never creates evidence or grants review.

Evaluation checks two supporting work identities for each cross-paper Claim, rejects repeated claim/evidence associations, and requires unique review coverage of the exact snapshot. Fixed human-authored cases expose unsupported scope expansion, causality, omitted opposition, negative proof from missing evidence and incomparable datasets. Their negative reviews exercise delivery policy; absent reviews remain pending.

## Alternatives considered

**Add a dedicated model reranker or automatic review call.** Deferred because model execution, budgets and durable Session recording belong to A. The existing synthesis pass can use these instructions without another stage.

**Assign relevance from keywords or card sections.** Rejected because a methods passage can answer one question and serve only as background for another.

**Merge duplicated source records or automatically certify semantic correctness.** Rejected because evidence identities and independent review must remain inspectable; structural checks cannot establish meaning.

## Consequences

A and B supply their existing materials without changes. Reading and report output become more inspectable, but semantic quality depends on the configured model and independent review. The fixed cases test policy, not live-model improvement. Owner-local report tests and the existing SDK recorded-session scenarios pin output and durable prompts. No additional retrieval, embeddings, model transport or Web UI change is introduced.
