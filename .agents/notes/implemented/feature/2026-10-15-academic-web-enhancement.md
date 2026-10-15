# Agent Note: Web selection for second-tier evidence

Status: implemented

English | [中文](2026-10-15-academic-web-enhancement.zh.md)

## Problem

The post-draft enhancement Remote persists a single selection per run, but the Web viewer has no selection action or supplemental evidence view. A lost RPC result must not trigger another enhancement or discard the original report.

## Decision

The Web panel invokes the existing Remote for one eligible paper version. Local synchronous locking prevents repeated clicks. The existing Session Remote supplies a complete snapshot and earlier history pages; a pure projector reads the selected run's selection, settlement and verified enhancement fragments. Excerpts retain their original identifiers, version, locator and source level. Selection/settlement sequence bounds exclude unrelated fragments. No Controller, Model, workflow or Remote fields change.

The panel preserves the first-tier report and its review status. It distinguishes local request activity, persisted selection without settlement, completed or partial settlement, failure, cancellation and unknown RPC outcome. History failure blocks dispatch; an already persisted selection never exposes another start action. Closing cancels only this enhancement request and ignores late callbacks. Reopening reads durable history rather than rerunning the paper.

## Alternatives considered

Using returned counts as evidence text would invent source material. Replacing the first-tier report would lose the user's existing deliverable. Automatic retry after transport failure could consume a second operation without a confirmed selection state. A new polling or history API would duplicate the existing Session journal reader.

## Consequences

The supplemental view is independent of report generation and semantic approval. It does not claim an unsettled selection is actively running. Failure settlements can report zero additions while earlier verified fragments remain readable; both observations remain visible. Initial history discovery reads the existing Session pages, and no extra model call is added by presentation. Real-paper model quality and full study acceptance remain joint work.

## Verification

Focused component tests cover one dispatch, the terminal outcomes, reopening, history failure and teardown. A fixed-paper browser scenario exercises the real Remote transport and Session journal with a scripted enhancement outcome, checks retained Markdown and recovered supplemental excerpts, and does not run a complete research cycle or a real model.
