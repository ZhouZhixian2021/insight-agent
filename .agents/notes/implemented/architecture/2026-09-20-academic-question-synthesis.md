# Agent Note: Question-driven synthesis between evidence and report

Status: implemented

English | [中文](2026-09-20-academic-question-synthesis.zh.md)

## Problem

Verified extraction can still produce a short template that does not answer the approved research questions. Source attribution, cross-paper reasoning and report delivery need distinct responsibilities and observable failures.

## Decision

The workflow processes the bounded candidate pool until evidence admission meets both Plan minimums when early stopping is enabled, or the successful inclusion cap is reached. Each work is attempted once; exclusion, failure, pause or empty evidence permits the next candidate. The same admission owns sufficiency and usable-work counts, so downloading full text cannot prematurely stop replenishment. Candidate exhaustion is explicit and does not create searches or weaken the Plan. A configured elapsed-time limit cancels outstanding work and retains settled observations. Insufficient-evidence draft generation remains separate from replenishment.

The Brief's includedWorkTypes selects version states, not conference or journal categories. Planning uses preprint, accepted_manuscript and version_of_record; preprint permission and retraction exclusions still apply. The controller checks fenced Academic plans at tool dispatch before review and repeats the shared analysis requirement check when reading approved plans. Field-specific diagnostics require a revised plan and renewed approval; no automatic category-to-version conversion changes a reviewed scope. Strict publication-category filtering requires source metadata absent from the current model.

The analysis library admits evidence with consistent versions, locators and known hashes, counts independent works with usable evidence, and resolves supported Plan sections before dispatch. Below the approved work or full-text minimums, the workflow retains completed paper results and returns no insight report. Warnings do not lower the approved evidence requirements. Retrieval and full-text parsing remain unchanged.

Question synthesis uses the Session-selected model and the extraction policy's explicit output reserve and attempt bound. Only output-limit exhaustion may retry. The shared transport persists and reads back the exact request before dispatch and records raw output, usage and settlement afterward. Separate academic/synthesis-request and academic/synthesis-result events keep the input Brief version, evidence graph and RetrievalRun identity reconstructable. Logging failures stop the run; ordinary model failures retain upstream results. No extractive-template fallback hides a failed analysis.

The model proposes Chinese paragraphs and an ordered question/section layout. Invalid JSON, Brief mismatches and invalid layouts reject the whole response. Paragraph checks independently reject malformed fields, unknown evidence, background-only support, insufficient independent works and missing uncertainty for opposing evidence. Host-owned rejection records retain original indexes and reasons. Accepted paragraphs keep their evidence links unchanged, receive remapped indexes and downgrade affected question coverage; empty affected sections disclose gaps. All rejected paragraphs yield no report. Only cross-paper synthesis supported by at least two independent works creates Claims; single-paper explanations remain source statements. Run-specific gaps belong in limitations or missing-evidence reasons, not unsupported Claims. Rejections never count as body text or semantic approval.

Report rendering displays question coverage, cites actual records and exposes incomplete questions, sections and body length. Repeated paragraph placements refer to the first rendering; citations and appendix do not satisfy body length. Structural validity and model-generated answered labels never establish semantic support. Synthesis reports remain drafts until independent question review is implemented.

## Alternatives considered

**Free-form model Markdown.** It prevents reliable checks of question coverage and evidence references. Structured output allows explicit validation and host-owned citation rendering.

**Replace full-text acquisition first.** Existing parsers and locators already provide the needed materials; transport failures remain independently visible.

**Fill gaps from model memory or repeated quotations.** This hides missing evidence and does not meet the approved research intent. Partial drafts disclose gaps instead.

## Consequences

The [baseline decision](2026-09-14-academic-report-slice.md) remains active for extractive-library and independent-review rationale. The [handoff](../../../../z-team_docs/模块分工/academic-synthesis-handoff.md), parser tests and keyless academic-evidence Session scenario pin mixed paragraph recovery, retained report content, rejection diagnostics and both SDK projections. Whole-response repair, model truncation recovery beyond the configured retry and independent semantic review remain separate work. Synthetic tests do not establish real-paper quality.
