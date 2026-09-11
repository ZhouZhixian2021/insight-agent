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
| [`model`](model/README.md) | Shared identifiers, records, result states, and pure model helpers | no service key |
| [`source`](source/README.md) | Scholarly-source access seam: provider registry, selection, and search vocabulary | `academicSource` |
| [`source-openalex`](source-openalex/README.md) | OpenAlex scholarly-source provider searching `/works` and normalizing into the shared model | injects `academicSource` |
| [`source-crossref`](source-crossref/README.md) | Crossref scholarly-source provider searching `/works` and normalizing into the shared model | injects `academicSource` |
| [`source-arxiv`](source-arxiv/README.md) | arXiv scholarly-source provider searching `/api/query` and normalizing into the shared model | injects `academicSource` |
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
