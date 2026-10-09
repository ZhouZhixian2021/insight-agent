# Agent Note: Version-scoped scholarly metadata screening

Status: implemented

English | [中文](2026-10-09-academic-scholarly-metadata-screening.zh.md)

## Problem

Provider normalization discards abstracts and keywords needed to distinguish relevant papers from query coincidences. Counting discovering queries or matched question breadth as topic relevance penalizes specialized papers. Merging preprint text into a published version would hide which content supplied an assessment.

## Decision

Academic Source records carry optional abstract and keyword availability alongside their work/version pair. Supported providers populate those fields from scholarly API data or official paper-page abstract blocks. Ingestion retains metadata per version, preserves the first available abstract, and unions available keywords for same-version duplicates. Missing fields remain unknown; another version's abstract and Web discovery snippets cannot fill them.

Academic Retrieval exposes `assessPlannedCandidates()` using explicitly reviewed concept groups, multilingual aliases, contribution cues, a reference year, and a recency window. It reads canonical-version metadata and titles independently of query provenance. Each question requires all its concepts; topic relevance takes the strongest topic or question fraction so a specialized paper retains its topical score. Method and evidence potential use separate lexical cues, not full-text resolution. Source quality records bibliographic completeness rather than scientific merit. Natural-language scope decisions remain unknown until evidence validation.

The [shared ranking policy](2026-09-29-academic-query-planning-candidate-ranking-contract.md) remains authoritative for weights and priorities. The Controller supplies reviewed criteria and explicit version-keyed full-text facts, then passes the resulting assessments to the existing ranker. Controller integration and Session recording remain consumer responsibilities; the pure screener performs no model or network calls.

## Alternatives considered

**Use query provenance as semantic assessment.** Query assignments describe discovery, not the paper's content, and question breadth is independent of topic relevance.

**Merge every available abstract at work level.** A preprint and its published version can make different claims; pooled text would misattribute those claims to the canonical version.

**Add a model classifier immediately.** It requires a separately reviewed adapter, durable model-call records, and calibration. Explicit terminology provides reproducible preliminary screening without adding those dependencies.

## Consequences

Consumers obtain explainable fractions and missing-data reasons without changing Academic Model or released Session formats. Lexical cues do not interpret negation, verify methodology, or prove question coverage; subject terms must appear in reviewed question concepts. Sparse catalog records remain sparse until official verification supplies metadata. The [executable handoff](../../../../packages/academic/retrieval/tests/rank.spec.ts) covers specialized, unrelated, multilingual, and incomplete records; ingestion tests preserve version isolation.
