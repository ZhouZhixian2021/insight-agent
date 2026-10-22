# Agent Note: Complete extraction supplements committed paper evidence

Status: implemented

English | [中文](2026-10-15-academic-evidence-supplementation.zh.md)

## Problem

Repeating complete extraction mints evidence identities even when a verified excerpt already supports a draft. Replacing the first-level result loses its committed references and source fields. Dropping every repeated record also loses new card classifications backed by that excerpt.

## Decision

`enhanceEvidenceInFragments` supplements a committed extraction result using the existing complete-depth fragment runner. Initial evidence must match the paper, version and content hash, with retained locator and evidence references. A changed fetched body requires separate extraction; enhancement does not promote an abstract record to full-text evidence.

All initial records, locators, question links and card items remain unchanged, and the result retains the initial card ID. Matching locations, statements and excerpts reuse committed evidence IDs. New question links and six-section classifications can reference those records. Equal classification fields and supporting IDs identify an existing item; different classifications remain distinct. No semantic equivalence is inferred from paraphrases.

The commit sink receives additions and rejection facts before another fragment runs. Its card items can cite initial records without resending them, so the caller must commit the initial result first. Classified failures return the accumulated evidence and incomplete ranges. Cancellation, unclassified errors and persistence failures reject the call while the caller retains initial evidence and prior sink commits. Workflow selection, model routing, Session logging and formal-review eligibility remain caller-owned.

The [minimal-depth decision](2026-10-14-academic-minimal-evidence-depth.md) owns first-level limits, and [fragment recovery](2026-10-14-academic-fragment-priority-recovery.md) owns dispatch budgets and failure handling. These decisions remain active.

## Alternatives considered

**Replace first-level evidence with a complete extraction result.** Rejected because new IDs invalidate committed references and cannot preserve the original extraction source fields and method.

**Discard all duplicate excerpts before card assembly.** Rejected because one verified excerpt can support additional sections or approved questions.

**Merge different versions or content hashes.** Rejected because a shared paper identity does not establish that quotes and locators address the same content.

## Consequences

Enhancement rereads caller-supplied content without the five-record cap. It adds source-checked material, but it does not certify semantic support, independent review or formal delivery. Initial `not_extracted` attributes remain available alongside supplementary classifications. Complete-depth limits and explicit partial-failure facts continue to apply; workflow activation and real-model calibration remain separate work.

## Verification

Owner-local tests cover six-section supplementation, unchanged source fields, extraction methods and identities, repeated excerpts with new classifications, repeat enhancement, rejected drafts, partial and total model failure, mismatched source identity, cancellation and sink failure. Existing minimal and complete fragment tests plus the fixed workflow handoff cover the shared runner. The two affected implementation modules have 100% statement, branch, function and line coverage.
