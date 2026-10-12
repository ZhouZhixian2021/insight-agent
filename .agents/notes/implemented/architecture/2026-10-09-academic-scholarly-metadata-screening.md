# Agent Note: Version-scoped scholarly metadata screening

Status: implemented

English | [中文](2026-10-09-academic-scholarly-metadata-screening.zh.md)

## Problem

Provider normalization discards abstracts and keywords needed to distinguish relevant papers from query coincidences. Counting discovering queries or matched question breadth as topic relevance penalizes specialized papers. Merging preprint text into a published version would hide which content supplied an assessment.

## Decision

Academic Source records carry optional abstract and keyword availability alongside their work/version pair. Supported providers populate those fields from scholarly API data or official paper-page abstract blocks. Ingestion retains metadata per version, preserves the first available abstract, and unions available keywords for same-version duplicates. Missing fields remain unknown; another version's abstract and Web discovery snippets cannot fill them.

Academic Retrieval exposes `assessPlannedCandidates()` using explicitly reviewed concept groups, multilingual aliases, contribution cues, a reference year, and a recency window. Its default screening derives lexical indications from the canonical title and scholarly abstract; keywords provide surface hits only. Each complete question match fits one quoted source. Exact approved query-to-question assignments route discovery separately and never establish question support. Optional externally reviewed details replace lexical indications for a work; `parseCandidateScreening()` validates complete JSON, exact source quotations, and approved question references. Topic relevance takes the strongest topic or question fraction so a specialized paper retains its topical score. Method and evidence potential use separate quoted cues, not full-text resolution. Source quality records bibliographic completeness rather than scientific merit. Unresolved natural-language scope remains unknown; a quoted, reviewed `off_topic` decision excludes the work.

The [shared ranking policy](2026-09-29-academic-query-planning-candidate-ranking-contract.md) remains authoritative for weights and priorities. The Controller supplies reviewed criteria and explicit version-keyed full-text facts, then passes the resulting assessments to the existing ranker. Controller integration and Session recording remain consumer responsibilities; the pure screener performs no model or network calls.

The Session-approved version-5 Academic plan carries exact question concept groups plus method, evidence, and optional contribution cues. The Controller validates those cues with the plan, preserves older plans without invented cues, and supplies the same reviewed criteria for initial and evidence-gap ranking. The readable Chinese plan explains the cues before the structured handoff; they prioritize full-text inspection and do not establish paper admission.

## Alternatives considered

**Treat query provenance as proof of paper content.** Query assignments describe discovery, not the paper's content, and question breadth is independent of topic relevance. The approved assignment supplies a batch route after a topical metadata match without awarding question-match points.

**Merge every available abstract at work level.** A preprint and its published version can make different claims; pooled text would misattribute those claims to the canonical version.

**Embed a model classifier in the retrieval library.** It would combine transport and durable model-call records with pure scoring. Callers may supply reviewed details while the retrieval library validates quotations and computes deterministic results.

## Consequences

`matchedQuestions` contains only complete quoted lexical matches or quoted externally reviewed question indications. The ranker scores those matches and validates quoted indications against canonical metadata; Q5 scheduling independently reads approved query provenance for evidence-gap batches. The existing `discoveredBy` identifiers carry that route without another public field or Session format change.

Consumers obtain explainable fractions and missing-data reasons without changing released Session formats. Chinese research questions can retain their reviewed English discovery route, while a separately reviewed indication may connect their exact question to an English abstract. Lexical cues do not interpret negation, verify methodology, or prove question coverage; subject terms must appear in reviewed topic or question concepts. A quotation establishes provenance, not semantic truth. Sparse catalog records remain sparse until official verification supplies metadata. The [executable handoff](../../../../packages/academic/retrieval/tests/rank.spec.ts) covers specialized, unrelated, multilingual, reviewed, and incomplete records; ingestion tests preserve version isolation.
