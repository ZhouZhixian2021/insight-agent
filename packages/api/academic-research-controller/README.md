---
description: "Session-backed Remote entry for one bounded Academic research pass."
kind: "package-reference"
---
# Academic Research Controller

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-api-academic-research-controller` owns `ctx.remote.academicResearch.run`. One call resolves an existing Session Agent, reconstructs the ResearchBrief approved through plan review, reuses the Session's selected model, searches every registered academic source, applies deterministic metadata filters, fetches full text, reviews natural-language scope rules with the model, extracts evidence, and returns the evaluated draft.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the controller with `academicSource`, `sessionController`, `typert`, and `web`. The Web application mounts the Academic source runtime with arXiv, CVF, ACL Anthology, and PMLR providers. The request supplies a Session ID, query, optional result bound, and synthetic-data disclosure. The controller reads the latest successful `exit_plan_mode` review from that Session, validates its single `academic-research-brief-json` block, and adds stable identity, version 1, and approval metadata. The caller therefore cannot substitute an unreviewed Brief. Model selection remains owned by the Session.

The operation claims the Agent's idle phase with `runMaintenance()`. The Academic preset ends its turn after plan approval, and the client starts this operation once the Session is idle. Active chat or another maintenance operation returns `session/agent-busy`. Remote cancellation and Agent cancellation share one signal. The response returns the workflow result, Session ID, and JSON-safe `retrievalRun` after the pass completes or observes cancellation. The run contains called providers, executed queries, deduplicated and included work identities, coverage counts, truncation reasons, and sanitized source or paper-operation failures; it does not provide reconnect recovery.

Metadata selection uses the canonical version, approved work type, preprint policy, publication window, retraction state, and included-work bound. Each source provider supplies its ordered full-text candidates. After full-text parsing, the model returns an explicit included or excluded decision with a reason; excluded papers remain in the paper results and contribute no evidence to analysis. Top-level `status` reports whether the call completed or was cancelled, `retrievalRun.status` reports success, partial success, or failure, and `report.evaluation.status` reports draft quality.

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

- CVF, ACL Anthology, and PMLR search only the catalog pages configured by the Web composition; adding a conference or volume is a configuration change.
- One Remote call remains open for the pass. Workflow recovery, progress streaming, persisted RetrievalRun records, retries, and long-paper chunking are deferred.
- Each approved plan currently creates Brief version 1 with an identity derived from the Session and approved plan call. Editing an already approved Brief as a later version is deferred.

-----

<a id="dev-note"></a>
### Dev Note

See the [Academic Remote execution decision](../../../.agents/notes/implemented/architecture/2026-09-16-academic-remote-execution.md).
