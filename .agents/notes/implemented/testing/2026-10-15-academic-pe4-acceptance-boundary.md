# Agent Note: Academic PE4 acceptance boundary

Status: implemented

English | [中文](2026-10-15-academic-pe4-acceptance-boundary.zh.md)

## Problem

Component checks for minimal evidence, report rendering, and selected-paper enhancement can all pass while the approved questions lose their evidence associations across the workflow. Scripted success also cannot establish real-source coverage, model quality, or latency.

## Decision

A workflow-level fixed matrix runs three distinct approved topics through ingestion, full-text parsing, evidence validation, synthesis, and draft evaluation. Each topic preserves one verified question-linked excerpt after another paper fails and leaves the unsupported question unanswered. A separate zero-evidence case stops before synthesis. Inputs and model responses are explicitly synthetic; Controller and Web contracts retain their own focused checks.

## Alternatives considered

Treating existing per-package tests as whole-run acceptance would miss cross-module question linkage. Treating synthetic excerpts as real-paper findings would overstate scientific and performance evidence. Replaying three full live runs for every code change would be slow and depend on external services.

## Consequences

The fixed matrix catches handoff regressions cheaply and preserves the original draft-versus-final distinction. Real approval, scholarly retrieval, model extraction, report quality, and selected-paper enhancement for all three topics remain separate acceptance work. B's same-paper baseline is needed before A can state a measured speed improvement.
