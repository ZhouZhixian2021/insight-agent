---
description: "Academic evidence: source-locator, evidence-record, and evidence-card construction with level-locator validation."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-evidence

English | [中文](README.zh.md)

## Summary

`dsh-academic-evidence` constructs source locators, evidence records, and evidence cards from the shared academic model, minting identities and enforcing the invariant the type system cannot express: a record's evidence level must match its locator kind. It is a library, not a Cordis service or plugin, and performs no retrieval, extraction, or model calls.

## Table of Contents

- [Use this package](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The retrieval increment builds a locator from retrieved material, then a record that references it by id, then a card that groups records into its six sections.

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

Construction fails loud with an `EvidenceError` when a record's level and locator disagree, a statement or provenance field is empty, or a card item cites no evidence.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `createSourceLocator()` | Builds one of the six locator variants with a fresh identity. |
| `createEvidenceRecord()` | Builds a record, validating the level-locator pairing and non-empty fields. |
| `createEvidenceCard()` | Builds a card with fresh item identities and per-item validation. |
| `SourceLocatorInput` | The six construction inputs, one per locator kind. |
| `EvidenceRecordInput` / `EvidenceCardInput` | The record and card construction inputs. |
| `EvidenceError` | Typed construction failure carrying a stable `code`. |

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the analysis or report consumer that renders evidence records and cards into model-visible context; this library contributes no prompt or schema of its own.

#### KV Cache effect

No direct invalidation; the consumer owns record ordering and serialization into prompts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No extraction** — the library constructs records from caller-supplied statements and excerpts; the retrieval/full-text extraction that produces them is a later increment.
- **No excerpt-hash presence rules** — the record validates level/locator/provenance but does not require an `available` excerpt for `abstract`/`fulltext` or a hash for `fulltext`; those rules await the extraction increment.
- **No run reporting** — constructing a record or card records no `RetrievalRun` or coverage statistics.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This pure library owns no event stream or mutable runtime data; focused unit tests pin locator construction, level-locator validation, empty-field rejection, and card-item validation.
