# Agent Note: Academic evidence - deterministic construction with level-locator validation

Status: implemented

English | [中文](2026-09-11-academic-evidence-construction.zh.md)

## Problem

The shared model defines `EvidenceRecord`, `EvidenceCard`, and the six `SourceLocator` variants, but only as types. Two invariants cannot be expressed in the type system: a record must cite a locator for the same work version, and its evidence level constrains the locator kind (`metadata` cites a provider record, `abstract` cites a character range in the abstract, `fulltext` cites a page, paragraph, table, or figure). Direct construction can violate either relation, and accepting a generated excerpt without checking the supplied paper can produce a traceable-looking quote that the source does not contain.

The Academic workflow owns model routing and durable request logging, while the evidence package owns single-paper extraction policy. The extraction operation therefore needs a model-independent generator input instead of calling `ctx.llm` or writing Session events itself.

## Decision

`@deepseek-ai/dsh-academic-evidence` (`packages/academic/evidence`) is a pure library. It owns deterministic construction and the single-paper extraction operation; the caller supplies semantic generation.

1. `createSourceLocator(input)` builds one of the six locator variants, minting `sourceLocatorId`, fixing `schemaVersion: 1`, defaulting `contentHash`, `printedPage`, `sectionTitle`, `title`, and `pdfPage` to `null`, and rejecting a negative character range, page, or paragraph number and a reversed character range.
2. `createEvidenceRecord(input)` mints `evidenceId`, requires the record and locator to name the same `workVersionId`, enforces the level-locator pairing, and rejects empty `sourcedStatement`, `sourceProvider`, `sourceUrl`, and `retrievedAt`. The record references the caller-built locator by `sourceLocatorId`.
3. `createEvidenceCard(input)` mints `evidenceCardId` and one `evidenceCardItemId` per entry across the six sections, rejecting an empty item statement; the non-empty `evidenceIds` tuple is already enforced by the shared type.
4. `extractEvidenceFromContent(input, generator, signal)` gives the generator the extraction instruction, focus questions, and locatable abstract/full-text segments. It verifies each returned excerpt as an exact substring, derives its locator, creates an evidence record with an available excerpt and hash, and groups the draft's items into one `EvidenceCard`. Cancellation is checked before and after generation.

Validation failures throw `EvidenceError` (re-implementing the `HarnessError` shape, no cross-package base) with stable codes: `EVIDENCE_VERSION_LOCATOR_MISMATCH`, `EVIDENCE_LEVEL_LOCATOR_MISMATCH`, `EVIDENCE_EMPTY_FIELD`, `EVIDENCE_INVALID_LOCATOR`, `EVIDENCE_EMPTY_ITEM_STATEMENT`, `EVIDENCE_INVALID_EXTRACTION`, and `EVIDENCE_EXCERPT_NOT_FOUND`.

## Level-locator pairing

| Level | Locator kinds |
|---|---|
| `metadata` | `provider_record` |
| `abstract` | `abstract` |
| `fulltext` | `page_section` \| `paragraph` \| `table` \| `figure` |

This is the one cross-field invariant the model's closed unions cannot carry, so it is enforced here at construction rather than trusted.

## Package topology

```text
@deepseek-ai/dsh-academic-model  <--depends on--  @deepseek-ai/dsh-academic-evidence
      shared records + ids                        library (construction + single-paper extraction)
```

Evidence depends only on the shared model. It defines no Cordis service and no provider. The caller-provided `EvidenceGenerator` adapts a workflow model call or another semantic extractor and validates external output before returning typed drafts.

## Alternatives considered

### Fold construction into the shared model

Rejected. The model owns vocabulary and pure helpers, not per-domain production; `createEvidenceRecord`'s level-locator rule is evidence-module policy that would couple the model to B's extraction decisions.

### Validate with a TypeScript-only approach

Rejected. The level-locator pairing crosses two independently-typed fields; a compile-time-only guarantee would require re-encoding every level as a distinct record type, which the shared model deliberately avoids.

### Call `ctx.llm` inside the evidence package

Rejected. A direct call would move model selection and model-visible request logging out of the Academic workflow. A supplied generator keeps the evidence policy reusable while the workflow preserves Session reconstruction.

### Ship a built-in keyword extractor

Rejected. Keyword rules cannot reliably distinguish methods, findings, conditions, and limitations. The operation instead accepts a semantic generator and applies deterministic provenance checks to its output.

## Consequences

**Construction fails loud.** A version mismatch, wrong level-locator pairing, invalid range, or empty field throws at construction, so analysis never receives internally inconsistent evidence.

**Generated quotes are source-backed.** The extraction operation rejects empty content, invalid segment references, and any excerpt absent from its referenced segment before constructing evidence.

**Model execution remains workflow-owned.** The evidence package supplies the extraction instruction and assembly rules but does not choose a model, call `ctx.llm`, validate model wire output, or append Session events.

**Direct constructors remain permissive.** `extractEvidenceFromContent()` always produces available excerpts and hashes, while callers using `createEvidenceRecord()` directly may still express unavailable values.

## Deferred work

- The retrieval/workflow integration that fills and persists records and cards, and records `RetrievalRun`/coverage.
- Card items that combine evidence from more than one extracted draft; each generated item currently cites its own record.
