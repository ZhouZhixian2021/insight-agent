# Agent Note: Academic integration with the U0 composition

Status: implemented

English | [中文](2026-10-21-academic-u0-integration.zh.md)

## Problem

The Academic deployment extends shared preset, approval, Web and Remote services. The pinned upstream release replaces filesystem preset discovery with declarative registrations, moves ordinary plan reading to the sidebar, and reads Web provider settings at execution time. Retaining the old shared implementations would discard those upstream changes.

## Decision

The [Web bundle](../../../../packages/bundle/web-app/package.json) declares Academic through `dsh-agent-preset`, alongside the upstream presets. Its patch owns the existing research composition and resolves its bundled skills relative to that patch. The registry owns preset selection and revisions; no filesystem-root discovery service is restored.

The [approval panel](../../../../packages/client/ui-user-questions/src/client/PlanReviewPanel.tsx) retains upstream preview actions and Remote settlement. A single named Academic execution block enables inline readable scope, folded execution details and natural-language revision. Revision submits feedback without approval; ordinary or ambiguous plans retain the upstream summary and sidebar preview.

The [Web service](../../../../packages/web/web/src/index.ts) gives an explicit call-scoped fetch provider precedence over the current deployment selection. Omitting that override reads the volatile setting and environment selection at execution time. Academic full-text fetching therefore selects its required provider without changing the user's general Web settings.

The [Remote assembly](../../../../packages/api/remotes/src/client/index.ts) mounts Academic research beside the upstream namespaces. The pi-ai adapter retains bounded call-local transport diagnostics while using the upstream model factories.

Persistence reads consume the returned `events` slice and retain upstream ownership metadata. Academic model producers declare their own message-source kinds. Plan review writes the explicit approval decision to durable tool-result metadata; Academic plan recovery requires that decision rather than treating every successful tool call as approval. Historical native results without this metadata require a fresh review. The build metadata reader accommodates the large Git status output of an uncommitted upstream merge.

The [persistence acknowledgement](../../../../docs/persistence-changes/2026-10-21-academic-u0-events.md) owns the same-version review for the added Academic events and attribution kinds.

## Alternatives considered

**Restore the filesystem preset registry.** This duplicates upstream selection ownership and loses declarative preset editing and revision lifetime.

**Use the general fetch default for Academic full text.** That couples evidence acquisition to a user-selected Web provider that may return summaries instead of full-text bytes.

**Replace the upstream approval panel wholesale.** This loses sidebar preview actions and Remote settlement. The Academic controls instead extend that panel only for its named execution block.

## Consequences

Existing T0 synchronous Session history reads retain line-scoped deprecation waivers under the upstream policy; no new synchronous reader or alias is introduced. Projection-based history access remains deferred.

Academic skill files move with the Web bundle and its publication manifest. Active test inputs reference the new location; dated development records retain their historical paths. Frozen T0 samples remain outside this upgrade checkout. Installation and compilation establish engineering compatibility; runtime research, historical-data compatibility and report quality require separate acceptance and are not implied by a successful build.
