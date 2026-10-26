# Agent Note: Minimal-evidence reports and concise Academic review

Status: implemented

English | [中文](2026-10-15-academic-minimal-report-review.zh.md)

The mandatory independent-review prerequisite is superseded by [automatic delivery](2026-10-26-academic-automatic-delivery.md); the remaining evidence and analysis decisions stay active.

## Problem

Minimal extraction retains verified records while its six-section card can be empty. Card-entry-only preparation discards those records and blocks a useful limited draft. Academic review also needs a natural-language feedback path without exposing machine fields as editable decisions.

## Decision

Preparation applies the existing version, locator, level and hash checks to standalone records not assigned to card entries. It preserves empty cards and original records rather than synthesizing card fields. Synthesis retains excerpt and hash requirements, approved shortage policy and the zero-evidence stop. Missing sections become one readable limitation instead of repeated internal diagnostics.

Analysis-local optional question associations preserve the producer's evidence IDs and exact approved question text. Parsing removes an answer's paragraph references when no supporting record has the corresponding supplied association, downgrading its status and disclosing the gap. Missing associations retain legacy structural handling; the report explicitly shows that extraction coverage is unavailable. Associations never prove semantic support. The workflow integrator must forward producer question links into both analysis and reporting; this change adds no Model, Remote, Controller or Workflow fields.

Academic review separates the six concise decision labels without removing source text. A revision sends the existing custom-only question response; it never sends an approval label or rewrites execution JSON. Approval is disabled while editing, and failed sends preserve feedback. Generic plan reviews retain their existing presentation.

## Alternatives considered

Manufacturing complete card entries would disguise extraction depth. Requiring every section before a draft would preserve the original failure. Parsing execution JSON in the client would duplicate the Controller and still not establish semantic agreement with readable prose. Adding another model judge would require separate orchestration, cost and Session recording.

## Consequences

Reports show approved questions, model answer proposals, cited producer associations and pending content review separately. Zero cited evidence cannot generate a synthesis report; incomplete coverage remains a limited draft. Existing evaluation checks still protect final delivery and independent-paper counts. Enhanced extraction, independent semantic review and real-model plan regeneration remain integration and joint-acceptance work, not implied by a successful structural test.

## Verification

Owner-local tests cover empty and partially filled cards, invalid records, shortage policies, missing and mismatched question associations, natural-language revisions and report delivery. Fixed report outputs and recorded SDK scenarios pin visible text. The browser scenario uses the real question service with fixed initial and revised plans; it does not claim real-model regeneration or a full academic search run.
