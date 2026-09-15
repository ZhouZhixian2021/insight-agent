# Agent Note: Academic evidence - fetched full text and deterministic construction

Status: implemented

English | [中文](2026-09-11-academic-evidence-construction.zh.md)

## Problem

The shared model defines `EvidenceRecord`, `EvidenceCard`, and the six `SourceLocator` variants, but only as types. Two invariants cannot be expressed in the type system: a record must cite a locator for the same work version, and its evidence level constrains the locator kind (`metadata` cites a provider record, `abstract` cites a character range in the abstract, `fulltext` cites a page, paragraph, table, or figure). Direct construction can violate either relation, and accepting a generated excerpt without checking the supplied paper can produce a traceable-looking quote that the source does not contain.

The Academic workflow owns network and model routing plus durable request logging, while the evidence package owns full-text preparation and single-paper extraction policy. A raw `ctx.web.fetch()` result does not prove that a page is complete academic full text and does not carry paragraph locators or a content hash. The evidence operations therefore need model-independent inputs instead of calling `ctx.web`, calling `ctx.llm`, or writing Session events themselves.

## Decision

`@deepseek-ai/dsh-academic-evidence` (`packages/academic/evidence`) is a pure library. It owns deterministic construction and the single-paper extraction operation; the caller supplies semantic generation.

1. `createSourceLocator(input)` builds one of the six locator variants, minting `sourceLocatorId`, fixing `schemaVersion: 1`, defaulting `contentHash`, `printedPage`, `sectionTitle`, `title`, and `pdfPage` to `null`, and rejecting a negative character range, page, or paragraph number and a reversed character range.
2. `createEvidenceRecord(input)` mints `evidenceId`, requires the record and locator to name the same `workVersionId`, enforces the level-locator pairing, and rejects empty `sourcedStatement`, `sourceProvider`, `sourceUrl`, and `retrievedAt`. The record references the caller-built locator by `sourceLocatorId`.
3. `createEvidenceCard(input)` mints `evidenceCardId` and one `evidenceCardItemId` per entry across the six sections, rejecting an empty item statement; the non-empty `evidenceIds` tuple is already enforced by the shared type.
4. `prepareFetchedAcademicFullText(input)` accepts only untruncated 2xx semantic HTML, removes non-content and hidden blocks, derives section-aware paragraph locators, uses the final URL, and hashes the normalized article.
5. `prepareFetchedAcademicPdf(input, signal)` accepts only untruncated 2xx PDF bytes, extracts text with PDF.js into one `page_section` segment per populated page, and hashes the exact bytes. Invalid, encrypted, scanned/textless, or otherwise unparseable PDFs fail instead of being labeled full text.
6. `fetchAcademicFullText(input, fetcher, signal)` tries caller-supplied candidate URLs in order, normally HTML before PDF, and returns the first confirmed full text. The caller adapts `ctx.web.fetch()` so provider selection and network policy remain workflow-owned.
7. `extractEvidenceFromContent(input, generator, signal)` gives the generator the extraction instruction, focus questions, and locatable abstract/full-text segments. It verifies each returned excerpt as an exact substring, derives its locator, creates an evidence record with an available excerpt and hash, and groups the draft's items into one `EvidenceCard`. Cancellation is checked before and after generation.

Validation failures throw `EvidenceError` (re-implementing the `HarnessError` shape, no cross-package base) with stable codes. Full-text preparation uses `EVIDENCE_FETCH_STATUS`, `EVIDENCE_FETCH_TRUNCATED`, `EVIDENCE_FETCH_BODY_UNSUPPORTED`, `EVIDENCE_FULLTEXT_UNCONFIRMED`, and `EVIDENCE_PDF_PARSE_FAILED`; construction and extraction retain their existing codes.

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
      shared records + ids                        library (HTML/PDF preparation + extraction + construction)
```

Evidence depends on the shared model, Node's SHA-256 implementation, and PDF.js for deterministic PDF text extraction. It defines no Cordis service and no provider. `AcademicWebFetchResult` structurally matches the fields used from `WebFetchResult`, so callers pass `ctx.web.fetch()` output without coupling this library to the web service package. Caller-provided fetch and generation adapters preserve workflow ownership of web/model routing.

## Alternatives considered

### Fold construction into the shared model

Rejected. The model owns vocabulary and pure helpers, not per-domain production; `createEvidenceRecord`'s level-locator rule is evidence-module policy that would couple the model to B's extraction decisions.

### Validate with a TypeScript-only approach

Rejected. The level-locator pairing crosses two independently-typed fields; a compile-time-only guarantee would require re-encoding every level as a distinct record type, which the shared model deliberately avoids.

### Call `ctx.llm` inside the evidence package

Rejected. A direct call would move model selection and model-visible request logging out of the Academic workflow. A supplied generator keeps the evidence policy reusable while the workflow preserves Session reconstruction.

### Consume the model-facing `web_fetch` text

Rejected. That text mixes presentation headers, untrusted-content notices, markdown conversion, and truncation notices with the body, and it loses the original response fields. Consuming the raw service result preserves status, final URL, body kind, and truncation before academic parsing.

### Add a general HTML parser abstraction

Rejected. The current HTML path needs only semantic article headings and paragraphs. The bounded tag subset keeps the evidence package dependency-free; publisher-specific or non-semantic layouts justify a parser when real fixtures require one.

### Ship a built-in keyword extractor

Rejected. Keyword rules cannot reliably distinguish methods, findings, conditions, and limitations. The operation instead accepts a semantic generator and applies deterministic provenance checks to its output.

## Consequences

**Construction fails loud.** A version mismatch, wrong level-locator pairing, invalid range, or empty field throws at construction, so analysis never receives internally inconsistent evidence.

**Generated quotes are source-backed.** The extraction operation rejects empty content, invalid segment references, and any excerpt absent from its referenced segment before constructing evidence.

**Partial resources do not become full-text evidence.** Failed, truncated, landing-page, abstract-only, and textless PDF results fail before evidence extraction. Accepted segments name their work version and carry a hash of the exact normalized HTML or PDF bytes used for derivation.

**Model execution remains workflow-owned.** The evidence package supplies the extraction instruction and assembly rules but does not choose a model, call `ctx.llm`, validate model wire output, or append Session events.

**Direct constructors remain permissive.** `extractEvidenceFromContent()` always produces available excerpts and hashes, while callers using `createEvidenceRecord()` directly may still express unavailable values.

**HTML and PDF have distinct locators.** HTML produces section-aware paragraph numbers; PDF produces physical PDF page numbers. Plain text, OCR, and non-semantic publisher layouts remain unsupported.

## Deferred work

- The workflow integration that persists records and cards and records `RetrievalRun`/coverage.
- Card items that combine evidence from more than one extracted draft; each generated item currently cites its own record.
