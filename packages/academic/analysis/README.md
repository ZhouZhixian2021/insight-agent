---
description: "Prepare traceable evidence for cross-paper analysis and locate excluded or incomplete material."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-analysis

English | [中文](README.zh.md)

## Summary

Callers use `prepareAnalysisInput()` to group evidence-card entries by work and actual content version. The result retains accepted entries, supporting records, source locators, and located issues. This pure library performs no search, model requests, persistence, or Claim generation.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Pass typed arrays of `AcademicWork`, `WorkVersion`, `EvidenceRecord`, `EvidenceCard`, and `SourceLocator` using the field names in [AnalysisInput](src/types.ts). External JSON must be validated by its owner before this same-process function is called. The caller receives `usable` when at least one card entry survives, or `no_usable_input` otherwise; `usable` does not certify evidence sufficiency, truth, or metric comparability.

Missing works or versions, inconsistent ownership, and retracted versions exclude cards. Missing evidence or locators, version/level mismatches, conflicting known content hashes, and metadata used as substantive support exclude entire entries. One invalid reference excludes its whole entry even if other references are valid. Duplicate IDs in any input object collection throw rather than selecting an arbitrary record. Unrelated valid entries survive.

Output groups preserve work input order, with versions and cards in card input order and entries in their original section order. Each work counts once, while all accepted actual versions remain separate, including accessible preprints when the canonical citation version is not supplied. Records and locators retain provenance. Objects are shared through readonly references; the function does not mutate input or create a persistent snapshot.

Unavailable entry fields retain their original `Availability` values and generate located limitations. Empty accepted sections, abstract-only support, missing excerpts, and unavailable hashes also generate limitations. These signals neither invent values nor establish that papers or research directions do not exist. No ranking or automatic comparability decision is produced.

See the [fixed synthetic tests](tests/prepare.spec.ts) and [shared model](../model/README.md). This library owns no divergent runtime observations and publishes no invariant companion; focused tests check its returned relationships.

<a id="model-experience"></a>
## Model Experience

### Prepared materials

#### What the model sees

Nothing directly. `prepareAnalysisInput()` returns typed materials to its caller and sends no model request.

#### Token effect

Zero direct tokens; rendering and request logging belong to the consuming workflow.

#### KV Cache effect

No model request or cache operation occurs in this package.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Analysis-local preparation types are not shared Claim or report types. Claim generation and semantic assessment await the shared model's analysis records.
- Structural checks do not verify quotations against full source content, compare experimental conditions, enforce an approved Brief, or detect stale evidence against an external store. Missing excerpts remain explicitly limited material.
- The returned subset is a preparation view, not a replacement producer card or a durable record. Do not persist it under the original card ID as new source evidence.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The root TypeScript projects and workspace lockfile include this package. See the [development record](../../../z-team_docs/开发记录/2026-09-14-ykxy11-分析输入准备.md) for validation and remaining documentation integration work.

</details>
