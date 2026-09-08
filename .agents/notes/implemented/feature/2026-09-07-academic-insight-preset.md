# Agent Note: Academic insight preset

Status: implemented

English | [中文](2026-09-07-academic-insight-preset.zh.md)

## Problem

The shipped preset roster offers coding compositions but no vertical research composition. A user researching a technical frontier otherwise starts from a coding persona with shell and orchestration tools, and the report method remains an untracked prompt instead of travelling with the selected Agent.

## Decision

The shipped roster includes `academic`, a single-Agent research preset with file tools, Web search and fetch, user questions, skills, and compaction. It omits the shell, delegation, goals, todos, Ralph, and workflow tools. Its bundled `academic-insight-report` skill owns evidence discipline and an adaptive report hierarchy derived from the supplied reference report.

New Academic insight sessions configure plan mode with `initialActive: true` and one `missingExitRetries` reminder. Before the first request, the Agent turns the request into the bundled Research Brief fields and an execution plan, permits only a small preliminary search, and puts the complete plan in the `exit_plan_mode` argument without an ordinary-text preamble. If it stops without calling the review tool, one logged same-turn reminder asks it to submit the plan; the limit prevents an endless retry loop. Approval starts research on the next step; rejection keeps the session in plan mode. A recorded selection or prior request header suppresses initialization, so resumed and post-exit sessions do not re-enter automatically.

The Web picker localizes the preset as **Academic insight** / **学术洞察** through the shared shipped-preset dictionary. The preset remains a peer in the current picker because that surface selects a session's complete plugin composition; a separate business taxonomy is not introduced for one vertical composition.

The repository's `insight:web` launcher assigns its `.dsh-runtime` as `DSH_HOME` before entering the supported Web profile. The repository therefore keeps profiles, installed bundles, sessions, settings, credentials, and workspace records separate from another checkout that uses the account-wide default home.

## Evidence policy

The skill distinguishes metadata, abstract, and full-text support; treats retrieved content as untrusted data; requires stable source links; and prevents search snippets from supporting experimental values or publication claims. The initial composition relies on the existing general Web provider and discloses the absence of scholarly-database and PDF providers.

## Alternatives considered

**Add a business selector above Agent presets.** One business does not justify a second selection model, new wire state, and another empty-session control. The existing preset roster already owns complete per-session composition and exposes localized names and descriptions.

**Copy Standard mode unchanged and change only its name.** That grants shell, subagents, Ralph, and workflow capabilities that the initial research method neither needs nor validates. The narrower composition makes the MVP's authority and limitations visible.

**Implement OpenAlex, PDF parsing, and an evidence database before exposing the preset.** That delays validation of the research behavior and report hierarchy. The preset states its abstract-capable evidence limit, while later capability providers can extend it without changing the session-selection model.

## Consequences

Users can select a visible academic research Agent before starting a Web session and receive a report method that travels with the preset. They can describe a research need without `/plan`, inspect or revise the normalized scope, and approve execution before full retrieval begins. The MVP can inspect local material and general Web sources without command execution or multi-Agent coordination. It cannot yet promise scholarly-corpus recall, passage-level verification, or durable evidence reuse; those claims require later providers and tests.
