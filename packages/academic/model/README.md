---
description: "Shared identifiers and field-state types for academic-insight packages."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-model

English | [中文](README.zh.md)

## Summary

`dsh-academic-model` owns the provider-neutral data vocabulary shared by academic-insight packages. It is a library, not a Cordis service or plugin, and performs no retrieval, evidence extraction, cross-paper analysis, report rendering, or model call.

## Table of Contents

- [Use this package](#use-this-package)
- [API](#api)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Academic packages import these types instead of declaring provider-specific substitutes. Provider and workflow packages translate their own records into this model at their package boundaries.

-----

<a id="api"></a>
## API

| Export | Role |
|---|---|
| `AcademicWorkId` | Stable identity shared by every known representation of one academic work. |
| `WorkVersionId` | Immutable identity of one content version of a work. |
| `EvidenceId` | Stable identity of one evidence card. |
| `ClaimId` | Stable identity of one report claim. |
| `ResearchBriefId` | Stable identity of one approved research brief. |
| `Availability<T>` | Five-state result for available, unknown, inapplicable, not-extracted, and failed values. |
| `isAvailable()` | Type-narrowing predicate for the value-bearing state. |
| `PartialDate` | Date text paired with year, month, or day precision. |
| `ExternalIdentifier` | Provider observation with original and normalized values. |
| `externalIdentifierDedupKey()` | Key over identifier kind and caller-normalized value. |
| `AcademicWork` | Cross-version identity, bibliography, and canonical citation version. |
| `WorkVersion` | Immutable content version with provenance, date, hash, and validity state. |
| `createAcademicWorkId()` | Random internal work identity. |
| `createWorkVersionId()` | Random internal identity for one immutable content version. |
| `ResearchBrief` | Versioned research scope, evidence requirements, report requirements, stop conditions, and review state. |
| `createResearchBriefId()` | Random internal identity shared by all versions of one research brief. |
| `isExecutableResearchBrief()` | Predicate that accepts only a brief whose current version has explicit approval. |
| `EvidenceRecord` | Traceable excerpt and sourced statement bound to the exact work version and source locator. |
| `SourceLocator` | Six locator variants for provider records, abstracts, sections, paragraphs, tables, and figures. |
| `EvidenceCard` | Six evidence-backed sections extracted from one immutable work version. |
| `EvidenceSnapshot` | Immutable set of evidence, work versions, and content hashes used for one brief version. |

`ProviderFailure` records a provider-neutral category, retry eligibility, and an optional absolute UTC retry time. `createFailureId()` creates the identity shared with failed `Availability` values. `createBatchResult()` keeps successful items and failures together: no failures means success even with zero items; items plus failures means partial success; failures without items means failure. It copies the input arrays without cloning their elements.

`CoverageSummary` contains observed counts and coverage limitations. `createCoverageSummary()` rejects counts that are not non-negative safe integers and truncated results without a non-blank limitation. It copies the limitation list and never estimates statistics. `providerBreakdown` is null because per-provider statistics are not supplied. These helpers do not execute retries, parse untrusted JSON, or authorize report publication.

`RetrievalRun` binds one run to an exact research-brief version and preserves executed queries, distinct provider names, included work IDs, coverage, and failures. `createRetrievalRunId()` creates its independent identity. `ResearchStage` has six lifecycle values. Planning, awaiting-approval, and running records have null status and completion time; completed, failed, and cancelled records carry both. Lifecycle and outcome remain separate: completion can have partial success, and cancellation retains successful items. The shared type does not enforce approval, perform transitions, or execute retrieval; those responsibilities belong to the workflow.

`ClaimRecord` retains a conclusion, its scope, explained confidence grade, and immutable evidence snapshot. `ClaimEvidenceLink` distinguishes support, contradiction, and background; `ClaimAssessment` records consumer-produced review with its method and version. Each record has its own branded identity and schema version. Consumers validate link existence and semantic support; the model does not interpret background as proof.

`checkClaimFreshness(claim, currentBrief, currentEvidence)` reads a map of current evidence keyed by EvidenceId. It returns current only when the brief identity/version, evidence identities, work versions, and non-blank content hashes all match. Known differences or a stored stale claim return stale; absent evidence, an empty snapshot, or unavailable hashes return unverifiable. Known changes take precedence while all reasons are retained. The function never rewrites history. Neither stale nor unverifiable may directly enter a final report; current is only a freshness check, not publication approval.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through workflow and analysis consumers that render these records into model-visible context.

#### KV Cache effect

No direct invalidation; consumers own record ordering and serialization into prompts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No hidden normalization** — providers normalize identifier values before requesting a deduplication key; the package does not guess provider-specific rules.
- **No persisted deduplication map** — the key rule is implemented, but the durable mapping record and merge-audit fields need a separate accepted design.
- **No analysis or semantic review** — consumers produce claims, links, and assessments; current evidence does not prove a conclusion.
- **No durable parser yet** — typed same-process callers need no redundant runtime validation; the persistence increment will validate untrusted JSON at ingress.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This pure library owns no event stream or mutable runtime data; its value algebra is enforced by focused unit tests.
