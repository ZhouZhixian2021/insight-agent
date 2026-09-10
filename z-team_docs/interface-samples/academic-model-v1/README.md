# Academic Model v1 fixed interface samples

English | [中文](README.zh.md)

## Status and purpose

| Item | Value |
|---|---|
| Owner | A, `ZhouZhixian2021` |
| Status | Documentation-level fixed samples, not a published API or runtime fixture |
| Data | Entirely fictional; does not represent real papers, sources, or retrieval results |
| Source impact | None; the samples exist only in `z-team_docs/` |

This directory uses fixed JSON to verify that member B's retrieval and evidence output can directly support member C's cross-paper analysis. Field names follow the [Academic Model v1 design baseline](../../模块分工/academic-model-v1-design.md) and [field reference](../../模块分工/academic-model-v1-field-reference.md); the field semantics are confirmed but are not a published source API.

## Files

- [`b-retrieval-evidence.sample.json`](b-retrieval-evidence.sample.json): simulates B's Research Brief, retrieval run, papers, versions, evidence, Evidence Card, coverage statistics, and item-level failures.
- [`c-analysis.sample.json`](c-analysis.sample.json): simulates C using stable IDs from B to create Claims, Claim–Evidence relations, and evaluation results.
- [`claim-freshness.sample.json`](claim-freshness.sample.json): simulates an old Claim becoming `stale` when its evidence version changes.

## Sample coverage

1. One `AcademicWorkId` links a preprint and a published version so the system does not count the work twice.
2. `canonicalVersionId` points to the published version, while the Evidence Record identifies the preprint version actually used when the full text is unavailable.
3. Evidence Records cover `fulltext`, `abstract`, and `metadata`, and express source text, sourced statements, or missing-data reasons.
4. A retrieval run returns `partial_success` and retains successful items together with a full-text-access failure.
5. B creates an Evidence Card for each paper; C consumes only the Card and Evidence Records for cross-paper analysis.
6. C's Claim links supporting, opposing, or background evidence through stable IDs and records the evidence versions used during analysis.
7. The system compares evidence versions before using a Claim; a mismatch prevents the Claim from entering the final report.
8. `EvidenceCard` always contains the six `researchQuestions`, `methods`, `datasets`, `metrics`, `findings`, and `limitations` sections; a section without evidence-supported items uses an empty array.
9. `Availability<T>` always uses five states; the wrapper stores only `status`, `value`, `reason`, or `failureId`, while all field-specific data remains inside `value`.

## Confirmed field rules

The samples do not use `null` in place of a core field's missing-data state; an empty array means the system confirmed that the section has no evidence-supported items. The field reference confirms these rules:

- `SourceLocator` uses `kind` to distinguish six locator types and binds a `WorkVersionId` and an available content hash.
- `ProviderFailure.category`, `retryable`, and `retryAfter` jointly determine failure classification and retry handling.
- Partial paper dates use `PartialDate`; run, review, and evaluation times use complete UTC ISO 8601 timestamps.
- Sessions store Briefs, runs, and model-visible snapshots; evidence objects enter the Evidence Store; large source texts enter separate file storage.

## Verification criteria

- A standard JSON parser must parse all three files.
- Every `academicWorkId`, `workVersionId`, and `evidenceId` referenced by C's sample must exist in B's sample.
- Multiple versions of one `AcademicWorkId` count as one research work.
- `metadata` evidence must not support experimental results or method details.
- `partial_success` must contain successful IDs and item-level failures.
- A version mismatch in the freshness sample must produce `stale`, and `mayEnterFinalReport` must be `false`.

Return to the [Academic Model v1 design baseline](../../模块分工/academic-model-v1-design.md).
