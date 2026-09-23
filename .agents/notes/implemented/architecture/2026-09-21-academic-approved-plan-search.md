# Agent Note: Search from the approved Academic plan

Status: implemented

English | [中文](2026-09-21-academic-approved-plan-search.zh.md)

## Problem

Users approved research intent but then had to supply search expressions in a separate form. Those expressions could diverge from the plan, and ordinary users had to understand retrieval terminology.

## Decision

The Academic preset generates searches in the same planning turn as the Research Brief. Version-3 structured plan handoffs require `searchPlan`, whose entries contain an exact `query`, Chinese `purpose`, links to the plan's `questions`, and an approved `retrieval` policy. The readable Chinese plan explains enabled channels, direct Academic providers, reference-verification providers, and Web-discovery and verification budgets; users do not author ids, enums, or JSON.

The first policy version supports `academic` and `web_discovery`. Direct search permits OpenAlex and arXiv; reference verification permits OpenAlex, arXiv, ACL, PMLR, and CVF. Web-discovery and verification bounds are non-negative and capped at eight; each must be positive exactly when Web discovery is enabled. Provider lists must be non-empty exactly when their channel needs them. Validation rejects unknown or duplicate channels/providers, blank or unsupported providers, unknown fields, negative or excessive bounds, and duplicate query expressions with different policies.

Validation also checks non-empty expressions, question membership and coverage, and the existing three-query and approved-round bounds. Exact duplicate expressions with the same policy execute once while retaining their purposes and question links.

The Controller owns this orchestration handoff. It extracts the existing version-1 domain Brief separately, so Academic model types remain unchanged. Version-1 and version-2 historical handoffs remain readable; a missing search plan requires completion and renewed approval before research can start. The system does not infer missing searches from a topic or silently alter approved requirements. Until A-H3 consumes the policy, preview may expose a version-3 plan but execution rejects it; silently ignoring approved channels or provider limits is forbidden.

The Web first previews the latest approved plan through `academicResearch.plan`. It shows the topic, research questions, and Chinese search directions without a query input. Starting passes the previewed `researchBriefId` to `academicResearch.run`; the Controller rereads approval and rejects a changed identity before retrieval. The existing idle-session maintenance operation executes saved queries through the unchanged pipeline. `RetrievalRun.queries` retains actual attempted expressions and the run's Brief identity links back to the reviewed plan.

## Alternatives considered

A separate model request after approval would add latency and an unreviewed query-generation step. Concatenating topic aliases would avoid a call but would not express complementary research questions. Generating the bounded searches during planning keeps their intent reviewable without requiring users to author technical expressions.

## Consequences

This replaces the manual-query Remote input described by the [explicit-query decision](2026-09-18-academic-explicit-query-orchestration.md). Sequential source execution, candidate deduplication, version and date filtering, extraction, and report synthesis are unchanged. Automatic research immediately on approval and adaptive search expansion remain deferred. The preview performs no model or source calls; starting research remains a separate user action.

Controller and Web tests cover saved-query execution, approval identity checks, legacy repair, malformed searches and policies, channel-dependent provider/budget consistency, preview failures, and cancellation. The authored Chinese plan and fixed policy fixtures verify the versioned handoff rather than real-model planning quality. Policy-aware search execution remains owned by A-H3.
