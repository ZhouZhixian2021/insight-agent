# Agent Note: Academic analysis input preparation

Status: implemented

English | [中文](2026-09-14-academic-analysis-input.zh.md)

## Problem

Individually typed academic records can contain broken cross-record references. Cross-paper analysis also needs to distinguish missing experimental information from reported values without counting multiple versions as independent works.

## Decision

The [analysis library](../../../../packages/academic/analysis/README.md) prepares a readonly view grouped by work and actual version. It excludes entries whose evidence relationships fail, retaining unrelated entries and explicit limitations. The returned filtered cards are views, not replacement persistent records. Duplicate object IDs reject the batch because choosing a record would make evidence identity ambiguous.

The module consumes the shared A1–A4 types and defines only preparation-local output types. It creates no Claim model, model-visible request, or Session event. The existing [evidence construction decision](2026-09-11-academic-evidence-construction.md) continues to own producer-side extraction; this decision supplements it with batch relationship checks and supersedes no active note.

## Alternatives considered

**Reject the whole batch for one broken reference.** This discards unrelated usable papers. Entry-level exclusion preserves partial progress while reporting the exact affected references.

**Infer comparability from equal metric names.** Dataset versions, evaluation conditions, and source depth may differ. Preparation records missing fields and retains original evidence instead of ranking results.

## Consequences

Consumers receive traceable materials and issues but must still enforce Brief requirements, assess semantics, and choose comparable experiments. The pure function does not mutate inputs; readonly references do not provide deep runtime freezing or durable snapshots. Retraction excludes a version; hash comparison only checks known hashes in the supplied batch, not external freshness.

## Testing

[Fixed synthetic tests](../../../../packages/academic/analysis/tests/prepare.spec.ts) exercise partial failure, missing references, ownership, evidence levels, unavailable fields, duplicate identities, multiple versions, and empty input without model or network calls.
