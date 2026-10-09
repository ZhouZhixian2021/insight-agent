---
description: "Plan reviewed Academic, Web, and site queries, retrieve verified candidates, and rank them with explainable priority queues."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-retrieval

English | [中文](README.zh.md)

## Summary

Academic workflow callers can create channel-specific searches from an approved ResearchBrief, retrieve verified works, and rank them into explainable P0/P1/P2 queues. Results retain verified Web discoveries, ingestion decisions, query provenance, and each candidate's filtering and scoring reasons. The library does not register a Cordis service or start a research run.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### When to use it

The Academic controller or workflow supplies the approved Brief, reviewed expansion terms, provider IDs, result bounds, and adapters. `planHybridSearch()` returns a `HybridSearchPlanningOutput` for review; `executePlannedSearchRound()` runs only the selected round after approval and can publish live Web-discovery, reference-identification, and reference-verification facts. `rankPlannedCandidates()` applies the approved hard filters and ranking policy to the verified works and caller-reviewed semantic assessments. `extendPlanForEvidenceGaps()` adds bounded queries from coverage of the same Brief version. See the [public exports](src/index.ts) for exact signatures.

### Entry point

Call `planHybridSearch(input, options)` with an approved `HybridSearchPlanningInput`. A valid result contains separate academic, Web, and requested-site queries with stable IDs. Invalid approval, hostnames, limits, or question links throw `RangeError`; optional expansions beyond the query limit produce a warning. Pass the reviewed plan, a round index, explicit verification limits, adapters, and an optional progress observer to `executePlannedSearchRound()`. The formal version-3 Controller path uses this executor for both approved rounds and bounded evidence-gap rounds; legacy plans without an explicit retrieval policy keep their compatibility adapter. Then pass the result, the same Brief, and exactly one `CandidateAssessment` per verified work to `rankPlannedCandidates()`. The result binds the Brief version, retains one complete evaluation per work, and returns ordered queues of `WorkVersionId` values. A missing Academic provider or cancellation rejects retrieval; incomplete semantic assessments reject ranking.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [planner](src/planner.ts) uses Brief aliases and caller-reviewed synonym or method terms; it does not infer terminology from prose. The [executor](src/execute.ts) sends each query to its specified channel, identifies Web references, verifies them through an approved scholarly provider, and passes only provider records to [ingestion](../ingestion/README.md). Ingestion merges exact identifiers and versions, retaining query IDs and verified discovery URLs. The [ranker](src/rank.ts) applies deterministic date, type, retraction, lexical, and reviewed rule decisions; a `null` natural-language decision is retained as a limitation and does not hard-exclude the candidate. It weights semantic fractions with the plan's policy, assigns priorities, and promotes source, team, question, and topic diversity within each queue. The caller owns semantic assessment, plan review, Session events, batching, and model-visible rendering.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

The [Academic Model](../model/README.md) defines plan and candidate records. [Academic Source](../source/README.md) supplies provider search and reference verification. The [Academic insight subsystem](../../../docs/subsystems/academic-insight.md) describes package ownership.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the workflow consumer that logs and renders planned queries and verified candidates; this library contributes no prompt or schema of its own.

#### KV Cache effect

No direct invalidation; the workflow owns logged model-visible inputs.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No semantic term inference** — callers supply reviewed synonym and method terms; Brief aliases are used directly.
- **No citation API execution** — citation expansion seeds remain in the shared plan for a later provider integration.
- **No durable run state** — the caller records approved plans, query settlements, and ingestion output in Session data.
- **Semantic assessments are required** — abstract and keyword evidence, rule decisions, relevance fractions, and contribution signals come from the caller's reviewed classifier; this library does not infer them from sparse provider metadata.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This pure library owns no persistent event stream; focused tests pin approval, query limits, verification, deduplication, filtering, and ranking behavior.
