---
description: "Plan reviewed Academic, Web, and site queries from an approved ResearchBrief, then retrieve verified and deduplicated scholarly candidates with query provenance."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-retrieval

English | [中文](README.zh.md)

## Summary

Academic workflow callers can create channel-specific searches from an approved ResearchBrief and execute one approved round against their Academic Source and Web adapters. The result contains provider-normalized works, verified Web discoveries, ingestion decisions, and the query IDs that discovered each work. The library does not register a Cordis service or start a research run.

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

The Academic controller or workflow supplies the approved Brief, reviewed expansion terms, provider IDs, result bounds, and adapters. `planHybridSearch()` returns a `HybridSearchPlanningOutput` for review; `executePlannedSearchRound()` runs only the selected round after approval. `extendPlanForEvidenceGaps()` adds bounded queries from coverage of the same Brief version. See the [public exports](src/index.ts) for exact signatures.

### Entry point

Call `planHybridSearch(input, options)` with an approved `HybridSearchPlanningInput`. A valid result contains separate academic, Web, and requested-site queries with stable IDs. Invalid approval, hostnames, limits, or question links throw `RangeError`; optional expansions beyond the query limit produce a warning. Pass the reviewed plan, a round index, explicit verification limits, and adapters to `executePlannedSearchRound()`. A missing configured Academic provider or caller cancellation rejects execution; expected Web and reference failures remain in per-query results beside successful siblings.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [planner](src/planner.ts) uses Brief aliases and caller-reviewed synonym or method terms; it does not infer terminology from prose. The [executor](src/execute.ts) sends each query to its specified channel, identifies Web references, verifies them through an approved scholarly provider, and passes only provider records to [ingestion](../ingestion/README.md). Ingestion merges exact identifiers and versions, retaining query IDs and verified discovery URLs. The caller owns plan review, Session events, batching, ranking, and model-visible rendering.

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

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This pure library owns no persistent event stream; focused tests pin approval, query limits, verification, and deduplication behavior.
