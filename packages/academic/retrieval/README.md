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

New assessments return `DetailedCandidateAssessment` with required `screening`. Scored question, method, evidence-type and contribution indications quote the canonical title or scholarly abstract verbatim. Complete lexical question and contribution matches must fit one quoted source. Keywords supply only `surfaceKeywordHits`, never these scores. Lexical scope remains `unknown`; missing abstracts do not establish irrelevance. The ranker rejects detailed scores without corresponding quotations, and a quoted Plan-specific `off_topic` decision causes hard rejection. Older assessments without `screening` retain their interpretation.

The optional sixth `reviewedScreenings` argument is a work-keyed map of externally reviewed details that replace lexical indications. `parseCandidateScreening(text, title, abstract, keywords, questions)` accepts complete JSON matching `CandidateScreeningDetails`, checks exact quotations and approved question references, and rejects unexpected fields. Reviewed method and evidence labels must match approved concept aliases; fractions count distinct concepts rather than repeated signals. A semantic review can associate an English abstract with an approved Chinese question without changing query routing. The caller owns review quality; quotations prove provenance, not the truth of the interpretation.

External review instructions must provide the exact Plan questions and scope rules, approved cues, canonical title and scholarly abstract. Distinguish actual research goals from mentions and negation, quote original text, and use `unknown` when metadata is insufficient. Judge code generation, image generation and security research against the current Plan rather than a global blacklist. Output only `schemaVersion: 1`, `signals`, `surfaceKeywordHits`, `uncertainties` and `scope`, with no scores or paper identities. The caller owns model transport, token policy and durable request/result records; this library makes no model calls.

The caller supplies `CandidateScreeningCriteria` and a resolution fact for every canonical version. Include subject terms in question concepts. Topic relevance uses the strongest topic or individual question fraction, so specialized papers need not match every question. Method and evidence fractions use their own cues; missing cues score zero. Natural-language rules remain `null` for full-text validation. `sourceQuality` measures bibliographic completeness, not scientific quality. Recency uses the Plan's date basis and optional `asOfYear`/`recencyWindowYears` pair; omit both when the reviewed publication window lacks either bound. Q5 separately derives discovery routes from approved queries without awarding question-match points.

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

The [planner](src/planner.ts) uses Brief aliases and reviewed expansions. The [executor](src/execute.ts) verifies Web references and passes only scholarly provider records to [ingestion](../ingestion/README.md). The [screener](src/assess.ts) derives quoted indications from canonical titles and abstracts or consumes external reviews. The [ranker](src/rank.ts) validates quotation-to-score relationships, applies hard filters and the approved weights, and orders diverse queues. A `null` natural-language decision remains a limitation without hard exclusion. The caller owns review, Session events, batching, and model-visible rendering.

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
