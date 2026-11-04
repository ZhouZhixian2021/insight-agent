---
description: "The academic group map for research capabilities, backend coordination, browser presentation, and profile composition."
kind: "package-group"
---

# packages/academic

English | [中文](README.zh.md)

## Summary

The academic group brings research logic, backend coordination, browser presentation, and profile composition into one directory. Its packages keep separate public APIs and Host or Client builds, so a consumer can reuse individual capabilities or select the complete Academic bundle. Shared Harness services remain in their framework groups.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`bundle`](bundle/README.md) | Academic profile composition, default configuration, and research skills | no service key |
| [`research-controller`](research-controller/README.md) | Plan approval, background research, recovery, and browser-facing operations | `academicResearchController` |
| [`client-remote`](client-remote/README.md) | Academic browser API registration over the shared Remote transport | `remote.academicResearch` |
| [`ui-research`](ui-research/README.md) | Research plans, progress, evidence, reports, and trace views | browser plugin |
| [`workflow`](workflow/README.md) | Full-text to evidence hash handoff and per-paper pauses | no service key |
| [`model`](model/README.md) | Shared identifiers, records, result states, and pure model helpers | no service key |
| [`analysis`](analysis/README.md) | Evidence input preparation and attributed cross-paper comparisons | no service key |
| [`eval`](eval/README.md) | Evidence integrity and explicit semantic-review eligibility | no service key |
| [`report`](report/README.md) | Evaluated Markdown drafts and final-delivery checks | no service key |
| [`source`](source/README.md) | Scholarly-source access seam: provider registry, single/all-source search, and full-text resolution | `academicSource` |
| [`source-arxiv`](source-arxiv/README.md) | arXiv scholarly-source provider searching `/api/query` and normalizing into the shared model | injects `academicSource` |
| [`source-openalex`](source-openalex/README.md) | OpenAlex search, scholarly metadata, and full-text locations | injects `academicSource` |
| [`source-cvf`](source-cvf/README.md) | CVF Open Access catalog and PDF provider | injects `academicSource` |
| [`source-acl`](source-acl/README.md) | ACL Anthology catalog and PDF provider | injects `academicSource` |
| [`source-browser`](source-browser/README.md) | Optional configured website search through DSH Playwright | injects `academicSource` |
| [`source-pmlr`](source-pmlr/README.md) | PMLR catalog and PDF provider | injects `academicSource` |
| [`ingestion`](ingestion/README.md) | Deduplication and version merging over provider-normalized records | no service key |
| [`retrieval`](retrieval/README.md) | Reviewed queries, verified candidates, and explainable ranking | no service key |
| [`evidence`](evidence/README.md) | Source-locator, evidence-record, and evidence-card construction | no service key |

-----

<a id="related-documentation"></a>
## Related documentation

- [Academic insight subsystem](../../docs/subsystems/academic-insight.md) — package ownership and dependency direction.
- [Academic source subsystem](../../docs/subsystems/academic-source.md) — the scholarly-source access seam vocabulary and selection contract.
- [Academic Model v1 design](../../z-team_docs/学术洞察/模块分工/academic-model-v1-design.md) — team-approved fields that will enter the package incrementally.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The [directory decision](../../.agents/notes/implemented/architecture/2026-11-04-academic-workspace-group.md) explains package boundaries and the checks that follow relocated browser code. The [team code navigation](../../z-team_docs/学术洞察/01-代码导航.md) maps implementation entry points.

</details>
