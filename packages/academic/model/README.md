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
- **Later records are absent** — claims, coverage, and batch results remain later member A increments.
- **No durable parser yet** — typed same-process callers need no redundant runtime validation; the persistence increment will validate untrusted JSON at ingress.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This pure library owns no event stream or mutable runtime data; its value algebra is enforced by focused unit tests.
