# Agent Note: Academic Remote execution

Status: implemented

English | [中文](2026-09-16-academic-remote-execution.zh.md)

## Problem

The Academic libraries formed a tested backend chain but had no application-owned entry that could reuse a user's Session model and Web services. Free-form inclusion and exclusion rules also could not be evaluated from arXiv's normalized title, author, and date metadata alone.

## Decision

`@deepseek-ai/dsh-api-academic-research-controller` owns one `academicResearch.run` Remote operation. It resolves the addressed Agent through Session Controller, claims the idle phase with `runMaintenance()`, derives model configuration from the latest Session request header or the Agent selection, and binds the Agent-scoped Academic search and Web fetch services to `runAcademicResearchDraft()`.

The request carries the Session identity, search query, result limit, and synthetic-data disclosure, but it does not carry a `ResearchBrief`. The controller reconstructs the Brief from the latest successful native or PTC `exit_plan_mode` event in the durable Session log, requires exactly one `academic-research-brief-json` fenced block, validates every field, derives a stable identity from the Session and approved tool call, and records version 1 with the review time. The Academic preset ends the approved planning turn without generic Web research so the host can wait for the Session to become idle before calling the Remote operation.

The Web composition mounts exactly one Academic search provider, arXiv. Deterministic selection filters canonical versions by work type, retraction, preprint policy, publication window, and the approved count before acquisition. The per-paper model response carries both a scope decision with a reason and evidence drafts. Excluded papers retain that decision but do not enter analysis.

Remote and Agent cancellation are combined. The call settles only after the bounded pass settles; no durable run identity or reconnect protocol is implied.

## Alternatives considered

**Let the browser select papers.** This would expose provider and ingestion details to the UI and make policy differ across consumers.

**Let the browser submit the approved Brief.** The caller could replace fields after approval, and the durable Session log would cease to be the authority for the executed scope.

**Interpret natural-language rules from search metadata.** arXiv normalization does not retain enough content to support those decisions, so this would create unsupported exclusions.

**Add start, follow, and resume operations immediately.** The workflow does not persist its lifecycle or complete result. A resumable transport would claim guarantees its storage cannot provide.

## Consequences

The first application path is small and uses existing Session, Remote, Academic source, and Web capability owners. C can call one typed operation and render its returned report without constructing the approved Brief. A Session whose approved plan lacks the structured block cannot start an Academic run, and approved Brief revisions beyond version 1 remain unsupported. A disconnected caller cannot recover the in-flight result, and each selected full text consumes one model request even when the scope decision excludes it. Additional searchable sources become complete application sources only after their provider-owned full-text candidate discovery is available.
