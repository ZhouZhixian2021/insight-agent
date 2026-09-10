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

The model defines opaque ids, five-state `Availability<T>`, academic works, immutable versions, partial dates, provider records, exact external-identifier deduplication keys, versioned research briefs that require current-version approval, traceable evidence, six-section evidence cards, and immutable evidence snapshots. Later increments add claims, coverage summaries, batch results, and durable parsing.
