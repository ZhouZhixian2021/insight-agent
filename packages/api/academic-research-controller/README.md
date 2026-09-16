---
description: "Session-backed Remote entry for one bounded Academic research pass."
kind: "package-reference"
---
# Academic Research Controller

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-api-academic-research-controller` owns `ctx.remote.academicResearch.run`. One call resolves an existing Session Agent, reuses its selected model, searches arXiv, applies deterministic metadata filters, fetches full text, reviews natural-language scope rules with the model, extracts evidence, and returns the evaluated draft.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the controller with `academicSource`, `sessionController`, `typert`, and `web`. The Web application mounts the Academic source runtime with arXiv as its explicit search provider. The request supplies a Session ID, approved ResearchBrief, query, optional result bound, and synthetic-data disclosure. Model selection remains owned by the Session.

The operation claims the Agent's idle phase with `runMaintenance()`. Active chat or another maintenance operation returns `session/agent-busy`. Remote cancellation and Agent cancellation share one signal. The response returns the workflow result and Session ID after the pass completes or observes cancellation; it does not provide reconnect recovery.

Metadata selection uses the canonical version, approved work type, preprint policy, publication window, retraction state, and included-work bound. arXiv supplies ordered HTML and PDF candidates. After full-text parsing, the model returns an explicit included or excluded decision with a reason; excluded papers remain in the paper results and contribute no evidence to analysis.

-----

<a id="model-experience"></a>
## Model Experience

### Academic research run

#### What the model sees

The controller adds no prompt. It forwards the approved `inclusionRules` and `exclusionRules` to the Academic workflow's per-paper model request and uses the Session's selected provider and model.

#### Token effect

Each selected paper can produce one bounded scope-and-evidence request. The workflow rejects a paper before dispatch when its estimated input plus output reserve exceeds the selected model's context window.

#### KV Cache effect

Each paper is an independent request and does not replay the Session conversation.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The shipped composition uses arXiv only. Additional full-text source providers remain source-owned work.
- One Remote call remains open for the pass. Workflow recovery, progress streaming, persisted run identity, retries, and long-paper chunking are deferred.

-----

<a id="dev-note"></a>
### Dev Note

See the [Academic Remote execution decision](../../../.agents/notes/implemented/architecture/2026-09-16-academic-remote-execution.md).
