---
description: "Build traceable evidence records and six-section evidence cards from locatable paper content with caller-supplied semantic extraction."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-evidence

English | [中文](README.zh.md)

## Summary

`dsh-academic-evidence` turns locatable abstract or full-text segments into verified source locators, evidence records, and a six-section evidence card. The caller supplies a semantic generator, while the library verifies every quoted excerpt against its source and enforces version and evidence-level consistency. It is a library, not a Cordis service or plugin; retrieval, model routing, and durable request logging remain with the calling workflow.

## Table of Contents

- [Use this package](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Call `extractEvidenceFromContent()` with paper segments and a semantic generator. The generator receives the extraction instruction, focus questions, locatable segments, and cancellation signal; it returns typed drafts after validating any external model output.

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
| `extractEvidenceFromContent()` | Runs semantic extraction, verifies exact excerpts, and builds one paper's records and card. |
| `createSourceLocator()` | Builds one of the six locator variants with a fresh identity. |
| `createEvidenceRecord()` | Builds a record, validating locator version, level, and non-empty fields. |
| `createEvidenceCard()` | Builds a card with fresh item identities and per-item validation. |
| `SourceLocatorInput` | The six construction inputs, one per locator kind. |
| `EvidenceRecordInput` / `EvidenceCardInput` | The record and card construction inputs. |
| `EvidenceExtractionInput` / `EvidenceExtractionResult` | Locatable paper input and the verified single-paper result. |
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

- **No retrieval or built-in model transport** — the caller supplies locatable text and a semantic generator so the workflow keeps provider selection and model-visible request logging.
- **One record per generated card item** — each extracted item cites the record produced from the same draft; multi-excerpt synthesis requires a later draft reference field.
- **Low-level constructors remain permissive** — direct `createEvidenceRecord()` calls may supply unavailable excerpts or hashes; `extractEvidenceFromContent()` always produces available excerpts and hashes.
- **No run reporting** — constructing a record or card records no `RetrievalRun` or coverage statistics.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This pure library owns no event stream or mutable runtime data; focused unit tests pin exact-excerpt verification, extraction assembly, locator construction, version/level validation, empty-field rejection, and card-item validation.
