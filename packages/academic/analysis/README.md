---
description: "Prepare traceable evidence for cross-paper analysis and locate excluded or incomplete material."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-analysis

English | [中文](README.zh.md)

## Summary

Callers use `prepareAnalysisInput()` to group evidence-card entries by work and actual content version. `analyzeEvidence()` creates attributed cross-paper method and finding comparisons with shared Claim records, evidence links and snapshots. This extractive baseline performs no search, model requests or persistence, and requires semantic review before final delivery.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Admission distinguishes `ready`, `ready_with_warning`, and `blocked`. Positive usable evidence below a work or full-text minimum is allowed only under `continue_with_warning`; zero usable evidence and insufficient evidence under `stop_for_review` remain blocked. Warnings disclose unmet minimums without changing the approved Brief. The model prompt records these limitations and requests partial or unanswered questions where support is missing.

Evidence admission also returns `usableWorkIds` for bounded replenishment even when the Plan minimum is unmet. These identify independent works with admitted evidence, not downloaded or merely scope-accepted papers.

`validateSynthesisRequirements()` checks proposed report requirements without granting approval. It returns supported sections or names every unsupported language, citation style, length unit, section and version state. `synthesisSections()` additionally requires current approval. Neither function rewrites the Brief.

`prepareSynthesisInput()` admits version-, locator- and hash-consistent evidence under the approved work/full-text minimums. `parseSynthesisDraft()` rejects invalid JSON, wrong Brief versions and invalid question/section layouts. Invalid paragraphs are quarantined in host-owned `rejectedStatements` with original zero-based indexes and reasons; retained paragraphs are reindexed and affected question coverage is downgraded. Empty affected sections disclose missing evidence. Unknown evidence, background-only support and insufficient independent works never become accepted conclusions. `synthesisPrompt()` puts run-specific gaps in limitations or missing-evidence reasons. `synthesisAnalysis()` mints shared Claims only for conclusions supported by at least two independent works. Single-paper explanations remain source statements. See the [synthesis decision](../../../.agents/notes/implemented/architecture/2026-09-20-academic-question-synthesis.md).

Pass typed arrays of `AcademicWork`, `WorkVersion`, `EvidenceRecord`, `EvidenceCard`, and `SourceLocator` using the field names in [AnalysisInput](src/types.ts). External JSON must be validated by its owner before this same-process function is called. The caller receives `usable` when at least one card entry survives, or `no_usable_input` otherwise; `usable` does not certify evidence sufficiency, truth, or metric comparability.

Missing works or versions, inconsistent ownership, and retracted versions exclude cards. Missing evidence or locators, version/level mismatches, conflicting known content hashes, and metadata used as substantive support exclude entire entries. One invalid reference excludes its whole entry even if other references are valid. Duplicate IDs in any input object collection throw rather than selecting an arbitrary record. Unrelated valid entries survive.

Output groups preserve work input order, with versions and cards in card input order and entries in their original section order. Each work counts once, while all accepted actual versions remain separate, including accessible preprints when the canonical citation version is not supplied. Records and locators retain provenance. Objects are shared through readonly references; the function does not mutate input or create a persistent snapshot.

Unavailable entry fields retain their original `Availability` values and generate located limitations. Empty accepted sections, abstract-only support, missing excerpts, and unavailable hashes also generate limitations. These signals neither invent values nor establish that papers or research directions do not exist. No ranking or automatic comparability decision is produced.

See the [fixed synthetic tests](tests/prepare.spec.ts) and [shared model](../model/README.md). No invariant companion is published because this library owns no divergent runtime observations; focused tests check its returned relationships.

<a id="model-experience"></a>
## Model Experience

### Prepared materials

#### What the model sees

`synthesisPrompt()` provides the approved Brief, accepted evidence graph, observed coverage and source failures as a structured, tool-free task. Paper contents are data, not instructions. The consuming workflow records and dispatches it; `prepareAnalysisInput()` itself sends no request.

#### Token effect

Prompt size follows the admitted evidence and approved questions; transport budgets and logging belong to the consuming workflow.

#### KV Cache effect

No model request or cache operation occurs in this package.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Preparation views remain analysis-local. Generated conclusions use A5 Claim records; extractive comparisons do not rank metrics or infer consensus, trends or research gaps.
- Structural checks do not verify quotations against full source content, compare experimental conditions, or detect stale evidence against an external store. Missing excerpts remain explicitly limited material.
- The returned subset is a preparation view, not a replacement producer card or a durable record. Do not persist it under the original card ID as new source evidence.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The root TypeScript projects and workspace lockfile include this package. See the [development record](../../../z-team_docs/开发记录/2026-09-14-ykxy11-分析输入准备.md) for validation and remaining documentation integration work.

</details>
