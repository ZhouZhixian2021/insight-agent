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
- [Incremental extraction](#incremental-extraction)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Pass ordered HTML/PDF URLs and a thin adapter over `ctx.web.fetch()` to `fetchAcademicFullText()`, then give its output to `extractEvidenceFromContent()`. The first confirmed full text wins: semantic HTML produces section-aware paragraph locators, while PDF produces page locators through PDF.js. Both paths reject non-2xx or truncated responses and attach the final URL plus a SHA-256 of the exact accepted content. `fetchAcademicFullText()` accepts an optional per-candidate observer that publishes `started` when each candidate attempt begins and `settled` with `success`, `failed`, or `cancelled`, its failure category, and the accepted body kind; observer failures are isolated and never change the acquisition result.

The caller supplies URLs resolved from the selected academic version's source records, never Web discovery URLs. A Web search snippet or provider-generated answer is not a fetched paper body. Direct calls to `extractEvidenceFromContent()` require caller-verified paper segments; exact excerpt matching checks a draft against those segments but cannot establish their origin.

```text
const source = await fetchAcademicFullText({
  academicWorkId, workVersionId, sourceProvider, retrievedAt,
  extractionMethod, focusQuestions, urls: [htmlUrl, pdfUrl],
}, (url, signal) => ctx.web.fetch({ url }, signal), signal)
const result = await extractEvidenceFromContent(source, generator, signal)
```

Call `extractEvidenceFromContent()` directly when the workflow already has verified, locatable paper segments. The generator receives an instruction to select explicitly supported facts, exact excerpts and one of six card sections, plus focus questions, locatable segments and a cancellation signal; it returns typed drafts after validating any external model output. The caller may mark unextracted card attributes `not_extracted`.

```text
const result = await extractEvidenceFromContent({
  academicWorkId, workVersionId, sourceProvider, sourceUrl, retrievedAt,
  contentHash, extractionMethod, focusQuestions,
  segments: [{ text: paragraph, locator: { kind: 'paragraph', paragraphNumber: 4 } }],
}, generator)
```

The result contains `sourceLocators`, `evidenceRecords`, run-specific `questionLinks`, and one `evidenceCard`. A draft's optional `questionIndexes` identifies the supplied focus questions directly supported by that exact excerpt. The extractor validates every index and copies the approved question text into `questionLinks`; invalid relations reject only that draft. The durable `EvidenceRecord` remains independent of a particular Brief. Each excerpt must occur exactly in its referenced segment. When a valid segment index points to the wrong segment, the extractor repairs it only if the unchanged excerpt has exactly one exact occurrence across all supplied segments. Ambiguous, normalized, absent, empty, or invalidly indexed excerpts fail with `EvidenceError` before untraceable evidence reaches analysis. The lower-level constructors remain available when a caller already owns verified evidence:

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

Set `depth: 'minimal'` on `EvidenceExtractionInput` to request three to five question-focused facts, accepting fewer when the source supports fewer. Supply approved `focusQuestions`; each retained draft must identify at least one of them. The extractor keeps at most five verified records and permits empty card sections or `not_extracted` attributes. Missing or empty question links reject only that draft. Omitted depth or `depth: 'complete'` uses the six-section extraction instruction without this record cap. Both modes retain exact quotes, locators, content hashes, source fields, extraction methods and actual paper versions.

Use `enhanceEvidenceInFragments(source, initialEvidence, options, signal)` to supplement committed first-level evidence with complete six-section extraction. The source must match the initial paper, version and content hash; missing evidence or inconsistent references reject before model dispatch. A different fetched body requires separate extraction. Enhancement retains every initial record, locator, question link and card item, including their identities, source fields and extraction methods, and keeps the initial card ID. Matching locations, statements and excerpts reuse existing evidence IDs; new question links and card classifications can reference them. Identical classifications are retained once, while differing classifications remain separate items.

The enhancement sink receives only additions and rejected-draft facts, using the initial card ID; new card items may cite previously committed evidence without resending its records or locators. The caller must commit initial evidence before enhancement and persist each addition before another fragment runs. The returned result combines initial evidence and committed additions. Classified failures leave earlier evidence available and identify incomplete ranges; cancellation, unclassified failures and sink errors reject the operation while the caller retains previous commits. Empty sections, retained `not_extracted` fields and successful extraction do not certify semantic support, independent review or formal delivery. The library does not activate workflow upgrades or choose a model.

Construction fails loud with an `EvidenceError` when a locator has an invalid range, a record's version or level disagrees with its locator, a statement, source provider, source URL or retrieval time is empty, or a card item cites no evidence.

Extraction rejects model source references individually. `EvidenceExtractionResult.rejectedDrafts` carries each rejected draft's zero-based `draftIndex`, `segmentIndex`, stable `code`, and diagnostic `reason`; accepted drafts alone create records, locators and card items. Empty excerpts, invalid segment indexes and non-matching or ambiguous quotes do not discard other accepted drafts. Exact quote checks remain mandatory, including Unicode and formula artifacts. Invalid program-owned input, generator errors and cancellation still reject the call. An empty proposal returns no records and no rejections; an entirely rejected proposal returns no records and its rejection list. JSON shape validation remains the caller's responsibility.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `fetchAcademicFullText()` | Tries candidate URLs in order and prepares the first confirmed HTML or PDF full text. |
| `AcademicFullTextObserver` / `AcademicFullTextObservation` | Optional per-candidate facts from `fetchAcademicFullText()`: `started` when each attempt begins, then `settled` with `success`/`failed`/`cancelled`, its `FailureCategory`, and the accepted `bodyKind`. Facts carry no timestamp; the observer owner stamps them. |
| `prepareFetchedAcademicFullText()` / `prepareFetchedAcademicPdf()` | Validates one raw fetch and prepares paragraph- or page-located content plus a hash. |
| `extractEvidenceFromContent()` | Runs semantic extraction, verifies exact excerpts, and builds one paper's records and card. |
| `extractEvidenceInFragments()` / `EvidenceFragmentOptions` | Verifies and commits smaller source ranges independently, with caller-classified local recovery and explicit input/output limits. |
| `selectScreeningFragments()` / `ScreeningFragmentPolicy` | Deterministic condition-targeted windows for pre-extraction scope review; no model call and no evidence records. |
| `createSourceLocator()` | Builds one of the six locator variants with a fresh identity. |
| `createEvidenceRecord()` | Builds a record, validating locator version, level, and non-empty fields. |
| `createEvidenceCard()` | Builds a card with fresh item identities and per-item validation. |
| `SourceLocatorInput` | The six construction inputs, one per locator kind. |
| `EvidenceRecordInput` / `EvidenceCardInput` | The record and card construction inputs. |
| `EvidenceExtractionInput` / `EvidenceExtractionResult` | Locatable paper input and the verified single-paper result. |
| `AcademicWebFetchResult` / `FetchedAcademicFullTextInput` | Structural fetch result and paper source metadata accepted by HTML/PDF preparation. |
| `EvidenceGenerator` / `EvidenceDraft` / `EvidenceQuestionLink` | Caller-owned semantic generation, its typed output, and the run-specific accepted evidence-to-question relation. |
| `EvidenceError` | Typed construction failure carrying a stable `code`. |

-----

<a id="incremental-extraction"></a>
## Incremental extraction

Use `extractEvidenceInFragments()` with verified paper input and the explicit limits in [EvidenceFragmentPolicy](src/fragment-types.ts). Adjacent short source segments are packed up to `maximumCharacters`; a long segment is split with the configured overlap. Each packed request preserves every source locator and abstract character offset. Drafts use local `segmentIndex` within that request. The generator also receives the original source ranges, paper/version identities, attempt number, extraction stage and output cap. The model adapter must apply `maximumOutputTokens` to the extraction call and record the exact request; synthesis keeps its own output budget.

The required asynchronous `onVerified` sink receives source-checked evidence before another range is dispatched. It owns durable storage; sink failures stop extraction. Accepted records and card-item identities survive final assembly. Overlapping identical evidence is deduplicated by source location, statement, exact quote and question links. Rejected-draft indexes remain local to the callback's fragment. `onFailure` is informational and isolated; returned failures retain the original error, including any provider request ID supplied by the adapter.

Minimal depth prioritizes lexical matches for each approved question in turn, with stable source order for ties and unmatched ranges. Optional `questionTerms` supplies one array of approved terms or phrases per `focusQuestions` entry, in the same order; a count mismatch fails before model dispatch. The caller can reuse approved screening aliases for Chinese questions about English text. Omitted hints use the question's words. Original segments, offsets and locator metadata remain unchanged; `fragmentIndex` identifies the original packed group even when dispatch order changes. Word or phrase matches arrange reading, never establish evidence or question coverage.

The caller classifies recoverable failures as `timeout`, `transport`, `parse_failed` or `incomplete_output`. Timeout, parsing and incomplete-output recovery split only the failed packed request at a source boundary, or halve a single long range when its size permits; transport recovery repeats that request with exponential backoff. `maximumAttempts` bounds all dispatches for each initial packed request, including both halves. The generator must make one model attempt per invocation, without nested batching or retries. Exhausted or undispatched recovery ranges appear in `incompleteFragments`; successful siblings remain available. Unclassified failures and cancellation reject the call, while previously committed fragments stay in the sink.

In minimal depth, a timeout, parse failure or incomplete output also starts subsequent groups with the same bounded split, within that paper only. Both children share their original group's attempt budget. A failed range that cannot split further is marked incomplete without repeating identical input; queued siblings and later groups still run within their budgets. Transport failures keep the original input and backoff policy. Complete depth keeps ordered dispatch and its retry policy. These rules reduce calls in fixed fixtures; real-model latency and evidence quality require separate calibration.

Minimal depth applies the five-record cap to the whole paper, after overlap deduplication and before the verified-result sink. Records, locators, question links and card references use the same retained identities. Extraction stops at the cap; undispatched source ranges remain in `incompleteFragments`, without a model failure. Derive unanswered questions from approved questions absent from `questionLinks`; five records do not establish complete question coverage. An empty card does not invalidate verified records or establish full review. The caller owns admission, evidence sufficiency and report delivery; minimal extraction does not grant formal-report eligibility.

The library dispatches fragments sequentially within one paper. Failure facts expose consecutive timeout/transport attempts, reset by a verified response, so the workflow can temporarily lower paper concurrency. The caller owns policy calibration, model timeouts, scope decisions, Session events and concurrency scheduling. This API does not activate itself in the Academic Controller; the workflow adapter must select it and map these facts into its existing run records.


-----

`EvidenceFragmentOptions.maximumCalls` optionally bounds all generator attempts across one paper, including retries. It does not count scope review or establish sufficiency. Exhaustion leaves undispatched ranges in `incompleteFragments`; committed evidence stays available. The optional fifth `fetchAcademicFullText()` argument prepares fetched sources through a caller-owned cache and must preserve complete-body validation, original text, hashes and locators.

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
