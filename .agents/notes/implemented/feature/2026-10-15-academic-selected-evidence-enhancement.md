# Agent Note: Selected second-tier Academic evidence enhancement

Status: implemented

English | [中文](2026-10-15-academic-selected-evidence-enhancement.zh.md)

## Problem

Automatically running complete-depth evidence extraction for every paper delays the first usable draft and exposes the whole run to fragment model failures. First-tier evidence must remain available even when a later enhancement fails.

## Decision

The approved first-tier workflow returns its limited draft before enhancement. A separate `academicResearch.enhanceEvidence` Remote accepts one paper version from a completed retrieval run. Only one selection is allowed per run. The controller verifies the selected paper has committed evidence, fetches its full text again, and requires the content hash to match the original version before recording the selection. The workflow then calls B's complete-depth fragment enhancer through the existing logged model route and durable verified-fragment sink. The operation has a 180-second total bound, a 60-second per-attempt bound and an 8,192-token output cap by default. Selection, verified additions and terminal settlement are persisted in the Session. Failure or cancellation retains the original evidence and report; enhancement does not approve or silently regenerate a report.

The first-tier admission path also forwards verified evidence-to-question links to synthesis and report generation, so a limited draft can distinguish supported questions from gaps.

## Alternatives considered

**Automatically enhance all included papers before drafting.** Rejected because it makes first results depend on every complete-depth extraction.

**Replace first-tier evidence with enhanced output.** Rejected because partial failure must not erase verified excerpts, provenance or the existing draft.

## Consequences

The Remote is a backend selection interface; a Web selection control and a separately reviewed upgraded report remain later work. The one-paper limit is durable for the retrieval run, including after an enhancement failure. Focused workflow and controller tests cover question-link forwarding, additive evidence and single-selection settlement. No live model run is implied by these tests.
