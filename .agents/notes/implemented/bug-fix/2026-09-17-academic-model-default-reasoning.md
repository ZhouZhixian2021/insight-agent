# Agent Note: Academic model default reasoning

Status: implemented

English | [中文](2026-09-17-academic-model-default-reasoning.zh.md)

## Problem

The Academic application entry converted an omitted reasoning effort to `low`. A configured model route that did not advertise selectable reasoning efforts was therefore rejected before search, even though the same route could run when no reasoning parameter was supplied.

## Decision

[`runAcademicResearchDraft`](../../../../packages/academic/workflow/README.md) passes an omitted reasoning effort unchanged to `resolveCallConfig`, so the selected provider and model apply their own default. An explicit caller choice remains part of the resolved call configuration and fails during preflight when the selected route does not support it. Preflight still completes before search or full-text acquisition.

This decision supersedes only the default reasoning statement in the [Academic paper handoff](../architecture/2026-09-15-academic-paper-handoff.md). The workflow still requires an explicit provider, model and output cap and does not alter B's retrieval or C's report interfaces.

## Alternatives considered

**Keep `low` as the application default.** One successful integration run does not establish support across model routes. Keeping this default prevents otherwise usable models from entering the pipeline.

**Declare `low` support for the current custom provider.** Reasoning parameters and their wire values belong to deployment-owned model metadata. The repository cannot assert that every endpoint serving the same model name accepts this parameter.

**Skip reasoning capability validation.** This would defer an explicit configuration error to the provider request and could consume retrieval work before failing.

## Consequences

Academic research can use models that do not expose configurable reasoning. The provider may choose a different internal reasoning level when callers omit the setting. Callers that require `low` must select a route that advertises it and pass it explicitly.

[Model tests](../../../../packages/academic/workflow/tests/model.spec.ts) cover an omitted effort on routes with and without configurable reasoning, a supported explicit effort, and an unsupported explicit effort rejected before search.
