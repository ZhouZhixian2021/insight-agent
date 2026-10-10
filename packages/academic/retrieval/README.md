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

### Metadata screening

`assessPlannedCandidates(plan, brief, round, criteria, fulltextFacts)` builds assessments from canonical-version scholarly abstracts, keywords, and titles. The caller supplies `CandidateScreeningCriteria` and a resolution fact for every canonical `WorkVersionId`. Each concept is a list of reviewed aliases; concepts match independently. A question is routed by a complete lexical concept match, or by the exact approved query-to-question assignment when the candidate also has a topical metadata match. This provenance fallback keeps Chinese research questions connected to papers discovered by their reviewed English queries; it does not add a semantic score or establish evidence support. Include subject terms in question criteria. Topic relevance uses the strongest topic or question concept fraction, so a specialized paper need not match every question. Method and evidence fractions use their own cues; missing cues score zero. Contribution types are lexical indications, and natural-language rules remain `null` for evidence validation. `sourceQuality` measures availability of authors, venue, date, identifiers, abstract, and keywords, not scientific quality. Recency uses the plan's date basis and the optional `asOfYear`/`recencyWindowYears` pair. Omit both values when the reviewed publication window lacks either bound; recency then scores zero instead of inventing a reference period.

```text
const assessments = assessPlannedCandidates(plan, brief, round, reviewedCriteria, fulltextFacts)
const ranking = rankPlannedCandidates(plan, brief, round, assessments)
```

The [screening tests](tests/rank.spec.ts) provide an executable handoff with reviewed Chinese/English aliases, a one-question P0 paper, an unrelated excluded paper, and explicit missing metadata. The Controller owns terminology review, full-text resolution, integration, and logging; metadata matches do not establish evidence coverage.

### Entry point

Call `planHybridSearch(input, options)` with an approved `HybridSearchPlanningInput`. A valid result contains separate academic, Web, and requested-site queries with stable IDs. Invalid approval, hostnames, limits, or question links throw `RangeError`; optional expansions beyond the query limit produce a warning. Pass the reviewed plan, a round index, explicit verification limits, adapters, and an optional progress observer to `executePlannedSearchRound()`. The formal version-3 Controller path uses this executor for both approved rounds and bounded evidence-gap rounds; legacy plans without an explicit retrieval policy keep their compatibility adapter. Then pass the result, the same Brief, and exactly one `CandidateAssessment` per verified work to `rankPlannedCandidates()`. The result binds the Brief version, retains one complete evaluation per work, and returns ordered queues of `WorkVersionId` values. A missing Academic provider or cancellation rejects retrieval; incomplete semantic assessments reject ranking.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [planner](src/planner.ts) uses Brief aliases and reviewed expansions. The [executor](src/execute.ts) verifies Web references and passes only scholarly provider records to [ingestion](../ingestion/README.md). The [screener](src/assess.ts) derives scores from retained metadata; it uses an exact approved query-to-question assignment only as a routing fallback for a candidate that already matches the topic. The [ranker](src/rank.ts) applies hard filters, weights assessment fractions with the plan's policy, and orders diverse priority queues. A `null` natural-language decision remains a limitation without hard exclusion. The caller owns review, Session events, batching, and model-visible rendering.

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
- **Lexical screening is preliminary** — reviewed aliases are explicit; missing metadata, negation, and methodological claims require evidence review. Full-text availability alone does not increase evidence potential.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This pure library owns no persistent event stream; focused tests pin approval, query limits, verification, deduplication, filtering, and ranking behavior.
