---
description: "Fetch and prepare academic HTML/PDF full text, then build traceable evidence records and six-section evidence cards with caller-supplied semantic extraction."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-evidence

English | [中文](README.zh.md)

## Summary

`dsh-academic-evidence` fetches and prepares complete academic HTML or PDF bodies and turns locatable abstract or full-text segments into verified source locators, evidence records, and a six-section evidence card. The caller supplies a web fetcher and semantic generator, while the library verifies every quoted excerpt against its source and enforces version and evidence-level consistency. It is a library, not a Cordis service or plugin; provider selection, model routing, and durable request logging remain with the calling workflow.

## Table of Contents

- [Use this package](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Pass ordered HTML/PDF URLs and a thin adapter over `ctx.web.fetch()` to `fetchAcademicFullText()`, then give its output to `extractEvidenceFromContent()`. The first confirmed full text wins: semantic HTML produces section-aware paragraph locators, while PDF produces page locators through PDF.js. Both paths reject non-2xx or truncated responses and attach the final URL plus a SHA-256 of the exact accepted content.

```text
const source = await fetchAcademicFullText({
  academicWorkId, workVersionId, sourceProvider, retrievedAt,
  extractionMethod, focusQuestions, urls: [htmlUrl, pdfUrl],
}, (url, signal) => ctx.web.fetch({ url }, signal), signal)
const result = await extractEvidenceFromContent(source, generator, signal)
```

Call `extractEvidenceFromContent()` directly when the workflow already has locatable paper segments. The generator receives the extraction instruction, focus questions, locatable segments, and cancellation signal; it returns typed drafts after validating any external model output.

```text
const result = await extractEvidenceFromContent({
  academicWorkId, workVersionId, sourceProvider, sourceUrl, retrievedAt,
  contentHash, extractionMethod, focusQuestions,
  segments: [{ text: paragraph, locator: { kind: 'paragraph', paragraphNumber: 4 } }],
}, generator)
```

The result contains `sourceLocators`, `evidenceRecords`, and one `evidenceCard`. Each excerpt must occur exactly in its referenced segment; invalid indexes, absent quotes, and empty content fail with `EvidenceError` before untraceable evidence reaches analysis. The lower-level constructors remain available when a caller already owns verified evidence:

```text
const locator = createSourceLocator({ kind: 'paragraph', workVersionId, paragraphNumber: 4 })
const record = createEvidenceRecord({
  academicWorkId, workVersionId, level: 'fulltext', sourcedStatement: '...',
  sourceLocator: locator, verbatimExcerpt: { status: 'available', value: '...' },
  sourceProvider: 'arxiv', sourceUrl: '...', retrievedAt: '...',
  contentHash: { status: 'available', value: '<sha>' }, extractionMethod,
})
const card = createEvidenceCard({ academicWorkId, workVersionId,
  researchQuestions: [{ statement: '...', evidenceIds: [record.evidenceId], questionType: { status: 'available', value: 'causal' } }],
  methods: [], datasets: [], metrics: [], findings: [], limitations: [] })
```

Construction fails loud with an `EvidenceError` when a locator has an invalid range, a record's version or level disagrees with its locator, a statement or provenance field is empty, or a card item cites no evidence.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `fetchAcademicFullText()` | Tries candidate URLs in order and prepares the first confirmed HTML or PDF full text. |
| `prepareFetchedAcademicFullText()` / `prepareFetchedAcademicPdf()` | Validates one raw fetch and prepares paragraph- or page-located content plus a hash. |
| `extractEvidenceFromContent()` | Runs semantic extraction, verifies exact excerpts, and builds one paper's records and card. |
| `createSourceLocator()` | Builds one of the six locator variants with a fresh identity. |
| `createEvidenceRecord()` | Builds a record, validating locator version, level, and non-empty fields. |
| `createEvidenceCard()` | Builds a card with fresh item identities and per-item validation. |
| `SourceLocatorInput` | The six construction inputs, one per locator kind. |
| `EvidenceRecordInput` / `EvidenceCardInput` | The record and card construction inputs. |
| `EvidenceExtractionInput` / `EvidenceExtractionResult` | Locatable paper input and the verified single-paper result. |
| `AcademicWebFetchResult` / `FetchedAcademicFullTextInput` | Structural fetch result and paper provenance accepted by HTML/PDF preparation. |
| `EvidenceGenerator` / `EvidenceDraft` | Caller-owned semantic generation and its typed output. |
| `EvidenceError` | Typed construction failure carrying a stable `code`. |

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the caller-provided generator that applies the extraction instruction and the analysis or report consumer that renders the resulting records and cards; the calling workflow owns model selection, request logging, and output validation.

#### KV Cache effect

No direct invalidation; the consumer owns record ordering and serialization into prompts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Caller-owned transport and model** — the caller supplies the `ctx.web.fetch()` adapter and semantic generator so the workflow keeps provider selection and model-visible request logging.
- **No OCR or publisher-specific layout parser** — HTML requires an `<article>` with recognized headings and paragraphs; PDF must contain extractable text. Scanned/image PDFs, plain text, and non-semantic HTML are rejected.
- **One record per generated card item** — each extracted item cites the record produced from the same draft; multi-excerpt synthesis requires a later draft reference field.
- **Low-level constructors remain permissive** — direct `createEvidenceRecord()` calls may supply unavailable excerpts or hashes; `extractEvidenceFromContent()` always produces available excerpts and hashes.
- **No run reporting** — constructing a record or card records no `RetrievalRun` or coverage statistics.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This pure library owns no event stream or mutable runtime data; focused unit tests pin HTML/PDF preparation and fallback, exact-excerpt verification, extraction assembly, locator construction, version/level validation, empty-field rejection, and card-item validation.
