# Agent Note: Academic evidence - deterministic construction with level-locator validation

Status: implemented

English | [中文](2026-09-11-academic-evidence-construction.zh.md)

## Problem

The shared model defines `EvidenceRecord`, `EvidenceCard`, and the six `SourceLocator` variants, but only as types. Nothing mints their identities, and one invariant cannot be expressed in the type system: a record's evidence level constrains its locator kind (`metadata` cites a provider record, `abstract` cites a character range in the abstract, `fulltext` cites a page, paragraph, table, or figure). A consumer that builds these records directly can pair any level with any locator, producing evidence that analysis and citation cannot trust.

Extraction — turning retrieved abstracts and full text into statements and excerpts — is a model-facing concern that arrives with the retrieval/workflow increment. What belongs in this package now is the deterministic construction and the invariant enforcement, independent of who later fills the content.

## Decision

`@deepseek-ai/dsh-academic-evidence` (`packages/academic/evidence`) is a pure library. It owns construction and validation; extraction remains a later increment.

1. `createSourceLocator(input)` builds one of the six locator variants, minting `sourceLocatorId`, fixing `schemaVersion: 1`, defaulting `contentHash`, `printedPage`, `sectionTitle`, `title`, and `pdfPage` to `null`, and rejecting a negative character range, page, or paragraph number.
2. `createEvidenceRecord(input)` mints `evidenceId`, enforces the level-locator pairing, and rejects empty `sourcedStatement`, `sourceProvider`, `sourceUrl`, and `retrievedAt`. The record references the caller-built locator by `sourceLocatorId`.
3. `createEvidenceCard(input)` mints `evidenceCardId` and one `evidenceCardItemId` per entry across the six sections, rejecting an empty item statement; the non-empty `evidenceIds` tuple is already enforced by the shared type.

Validation failures throw `EvidenceError` (re-implementing the `HarnessError` shape, no cross-package base) with stable codes: `EVIDENCE_LEVEL_LOCATOR_MISMATCH`, `EVIDENCE_EMPTY_FIELD`, `EVIDENCE_INVALID_LOCATOR`, `EVIDENCE_EMPTY_ITEM_STATEMENT`.

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
      shared records + ids                        library (createSourceLocator / createEvidenceRecord / createEvidenceCard)
```

Evidence depends only on the shared model. It defines no Cordis service and no provider.

## Alternatives considered

### Fold construction into the shared model

Rejected. The model owns vocabulary and pure helpers, not per-domain production; `createEvidenceRecord`'s level-locator rule is evidence-module policy that would couple the model to B's extraction decisions.

### Validate with a TypeScript-only approach

Rejected. The level-locator pairing crosses two independently-typed fields; a compile-time-only guarantee would require re-encoding every level as a distinct record type, which the shared model deliberately avoids.

## Consequences

**Construction fails loud.** A wrong pairing or an empty field throws at the boundary, so analysis never receives a record whose level and location disagree.

**Content is caller-owned.** The library neither retrieves nor extracts; the caller supplies the statement, excerpt, hash, and provenance, so the deterministic layer stays testable without a model.

**Excerpt-hash presence is unenforced.** The library does not yet require an `available` excerpt for `abstract`/`fulltext` or a hash for `fulltext`; those presence rules belong with the extraction increment that knows what material was actually retrieved.

## Deferred work

- Extraction of statements and excerpts from retrieved abstracts and full text.
- Presence rules for `verbatimExcerpt` and `contentHash` by level.
- The retrieval/workflow integration that fills and persists records and cards, and records `RetrievalRun`/coverage.
