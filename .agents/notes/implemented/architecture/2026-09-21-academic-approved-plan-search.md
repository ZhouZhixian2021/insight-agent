# Agent Note: Search from the approved Academic plan

Status: implemented

English | [中文](2026-09-21-academic-approved-plan-search.zh.md)

## Problem

Users approved research intent but then had to supply search expressions in a separate form. Those expressions could diverge from the plan, and ordinary users had to understand retrieval terminology.

## Decision

The Academic preset generates searches in the same planning turn as the Research Brief. Version-2 structured plan handoffs require `searchPlan`, whose entries contain an exact `query`, Chinese `purpose`, and links to the plan's `questions`. Validation checks non-empty expressions, question membership and coverage, and the existing three-query and approved-round bounds. Exact duplicate expressions execute once while retaining their purposes and question links.

The Controller owns this orchestration handoff. It extracts the existing version-1 domain Brief separately, so Academic model types and source provider interfaces remain unchanged. Version-1 historical handoffs remain readable; a missing search plan requires completion and renewed approval before research can start. The system does not infer missing searches from a topic or silently alter approved requirements.

The Web first previews the latest approved plan through `academicResearch.plan`. It shows the topic, research questions, and Chinese search directions without a query input. Starting passes the previewed `researchBriefId` to `academicResearch.run`; the Controller rereads approval and rejects a changed identity before retrieval. The existing idle-session maintenance operation executes saved queries through the unchanged pipeline. `RetrievalRun.queries` retains actual attempted expressions and the run's Brief identity links back to the reviewed plan.

## Alternatives considered

A separate model request after approval would add latency and an unreviewed query-generation step. Concatenating topic aliases would avoid a call but would not express complementary research questions. Generating the bounded searches during planning keeps their intent reviewable without requiring users to author technical expressions.

## Consequences

This replaces the manual-query Remote input described by the [explicit-query decision](2026-09-18-academic-explicit-query-orchestration.md). Sequential source execution, candidate deduplication, version and date filtering, extraction, and report synthesis are unchanged. Automatic research immediately on approval and adaptive search expansion remain deferred. The preview performs no model or source calls; starting research remains a separate user action.

Controller and Web tests cover saved-query execution, approval identity checks, legacy repair, malformed searches, preview failures, and cancellation. The authored Chinese-plan Session snapshot records the version-2 handoff and the current template; it verifies replay behavior rather than real-model planning quality.
