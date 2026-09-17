---
description: "The academic group map for provider-neutral academic-insight models and capabilities."
kind: "package-group"
---

# packages/academic

English | [中文](README.zh.md)

## Summary

The academic group owns reusable academic-insight domain types and capabilities. Product UI, generic Web providers, and provider-specific retrieval integrations remain with their existing owners.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`workflow`](workflow/README.md) | Full-text to evidence hash handoff and per-paper pauses | no service key |
| [`model`](model/README.md) | Shared identifiers, records, result states, and pure model helpers | no service key |
| [`analysis`](analysis/README.md) | Evidence input preparation and attributed cross-paper comparisons | no service key |
| [`eval`](eval/README.md) | Evidence integrity and explicit semantic-review eligibility | no service key |
| [`report`](report/README.md) | Evaluated Markdown drafts and final-delivery checks | no service key |
| [`source`](source/README.md) | Scholarly-source access seam: provider registry, single/all-source search, and full-text resolution | `academicSource` |
| [`source-arxiv`](source-arxiv/README.md) | arXiv scholarly-source provider searching `/api/query` and normalizing into the shared model | injects `academicSource` |
| [`source-cvf`](source-cvf/README.md) | CVF Open Access catalog and PDF provider | injects `academicSource` |
| [`source-acl`](source-acl/README.md) | ACL Anthology catalog and PDF provider | injects `academicSource` |
| [`source-pmlr`](source-pmlr/README.md) | PMLR catalog and PDF provider | injects `academicSource` |
| [`ingestion`](ingestion/README.md) | Deduplication and version merging over provider-normalized records | no service key |
| [`evidence`](evidence/README.md) | Source-locator, evidence-record, and evidence-card construction | no service key |

-----

<a id="related-documentation"></a>
## Related documentation

- [Academic insight subsystem](../../docs/subsystems/academic-insight.md) — package ownership and dependency direction.
- [Academic source subsystem](../../docs/subsystems/academic-source.md) — the scholarly-source access seam vocabulary and selection contract.
- [Academic Model v1 design](../../z-team_docs/模块分工/academic-model-v1-design.md) — team-approved fields that will enter the package incrementally.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
