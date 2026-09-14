---
description: "Academic insight package ownership and dependency direction."
kind: "subsystem"
---

# Academic insight subsystem

English | [中文](academic-insight.zh.md)

## Summary

Academic insight is an optional business subsystem built on harness extension points.

## Dependency direction

`packages/academic/model` is the lowest academic layer. It may depend on shared utilities but not on retrieval, workflow, report, or client packages. Later academic packages depend inward on the model.

## Member ownership

Member A owns the shared model, workflow contracts, and integration decisions. Member B owns provider normalization and single-paper evidence production. Member C owns cross-paper claims, coverage assessment, and report presentation.

Shared record changes land through member A so provider-specific and report-specific concerns do not leak into the common model.

## Initial model increment

The model defines opaque ids, five-state `Availability<T>`, academic works, immutable versions, partial dates, provider records, exact external-identifier deduplication keys, versioned research briefs that require current-version approval, traceable evidence, six-section evidence cards, and immutable evidence snapshots. Provider-neutral failures, batch outcomes, and observed coverage are defined in the [model package](../../packages/academic/model/README.md). Empty successful searches remain successful; partial failures retain successful items, and truncated coverage requires a reason. RetrievalRun binds ordered queries, providers, coverage, and failures to a brief version. Its six-stage ResearchStage distinguishes lifecycle from the final batch outcome; open stages have no final status or completion time. Workflow consumers enforce approval and transitions. ClaimRecord, ClaimEvidenceLink, and ClaimAssessment preserve conclusions, opposing or supporting evidence, and review provenance. checkClaimFreshness compares the analysis snapshot against the current brief and evidence without mutation. Known changes are stale; missing evidence or hashes are unverifiable; a current result is not semantic approval. Durable parsing and execution remain outside these shared records.
