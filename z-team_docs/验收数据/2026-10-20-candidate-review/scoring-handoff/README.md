# Complete scoring handoff for eight candidate reviews

English | [中文](README.zh.md)

## Purpose and scope

B can reproduce the Pro/Flash review selection, complete candidate assessments, P0/P1/P2 queues and research-question matches to explain why model judgments change scores and queues. The material comes from the same eight real reviews on 2026-10-20 and retains approved parameters, scholarly metadata, validated model judgments and recorded scores. No model key, Web service or A-local `.dsh-runtime` is required.

This package contains only the eight fixed review candidates and cannot identify papers omitted from the complete original discovery pool. `candidateQuestionCoverage` describes query routing and semantic question matches from titles/abstracts; it contains no full-text evidence IDs and does not establish evidence-supported coverage or research completion. Model outputs are not C's independent reference labels. The saved full-text facts establish only that the original address resolution returned candidate URLs, without promising a successful download or parse today.

## Files and fields

| File | Material available for review |
| --- | --- |
| [input.json](input.json) | Same-version approved `brief`, approved queries in `approvedSearches`, reviewed concepts in `candidateScreening`, original provenance plan in `sourcePlan`, eight canonical works/versions/abstracts/keywords/dates and original query provenance in `records`, frozen full-text address facts in `fulltextResolutions`, and deployment limits. |
| [pro.json](pro.json) | Pro Session, model configuration, per-work request/result sequences and usage, actual selection decisions, validated quotations, exact execution Plan, deterministic assessment criteria, lexical assessments and ranking, complete post-review `scheduling.assessments`/`ranking`/batch policy, and question-match summaries. |
| [flash.json](flash.json) | The equivalent complete Flash records, retaining its own execution query IDs and provenance mapping. |
| [comparison.json](comparison.json) | All component scores, queue positions, total-score changes, added/removed questions and disagreements requiring independent review for each of the eight works. |
| [manifest.json](manifest.json) | Data version, source revision, original and replay Session IDs, scope limitations and SHA-256 hashes of the four JSON files. |

`records` preserves the original canonical work and version identities; do not replace them with deduplication output that allocates fresh IDs. The two review runs replanned queries and therefore have different query IDs. The replay maps original query expressions from `sourcePlan` to each `scheduling.plan`, deduplicating provenance IDs as the production Controller does; `queryProvenance` retains the exact expected mapping. Query routing allocates review opportunities and adds no semantic question-match points.

`selectionEvent` is the committed selection event, retaining `eventSeq`, round and the complete `CandidateReviewSelectionV1`; its list is not inferred from final scores. `verifiedReviews` retains validated judgments, request sequences and event sequences, while `requestFacts`/`resultFacts` link the calls. `initialLexical` reconstructs pre-model assessments and ranking from frozen inputs, execution Plans and existing pure functions; it is not another model run. Post-review `scheduling` is exported directly from the saved actual result. Replay checks both kinds of provenance field by field.

## Replay

After installing repository dependencies, run this command from the repository root:

```powershell
pnpm exec vitest run packages/api/academic-research-controller/tests/candidate-review-handoff.spec.ts
```

The entry reads this package and calls existing pure functions without launching a DSH application, searching, fetching full text or calling a model. It restores canonical identities from frozen deduplicated records, checks file hashes, regenerates approved assessment criteria, lexical ranking and selection, validates quotations, then recomputes complete assessments, component scores, queue order and candidate question matches. Three checks are expected to pass: Pro replay, Flash replay and attribution of every score difference.

If replay fails, confirm the source revision and interface version, then inspect the affected work's assessment, provenance mapping or queue difference. Record decisions that change scoring or the shared protocol; do not update expected data merely to make the check pass. Unchanged production algorithms and material do not require another eight-paper model run.

## Recorded results and differences

Both runs use the same approved weights: topic 30, question match 20, evidence potential 15, method match 10, version type 8, bibliographic completeness 7, recency 5 and resolvable full-text address 5. P0/P1/P2 thresholds are 80/65/50. Five research questions divide the 20-point question component equally, so one additional validated match adds 4 points. The review budget of 8 remains separate from the Plan candidate cap of 30 and final inclusion cap of 10.

| Model | P0 | P1 | P2 | Excluded | Review time |
| --- | --- | --- | --- | --- | --- |
| Pro | 0 | 2 | 6 | 0 | 273.636 seconds |
| Flash | 0 | 4 | 4 | 0 | 132.316 seconds |

| Paper | Matched questions, Pro → Flash | Total score, Pro → Flash | Queue, Pro → Flash |
| --- | --- | --- | --- |
| Multi-Agent Cooperative Planning and Execution Framework | 3 → 4 | 62 → 66 | P2 → P1 |
| Evaluation and Benchmarking of LLM Agents | 1 → 2 | 54 → 58 | P2 → P2 |
| Orchestration and Verification of Agentic AI Systems | 3 → 5 | 62 → 70 | P2 → P1 |

The other five works have identical component scores, although their positions can shift when other works change. Each execution's `ranking.queues` supplies the actual order, including existing diversity rules. This package preserves that order rather than presenting a table sorted only by total score as the formal queue. All score differences come from the question-match component; other components are unchanged.

Recency is zero because the approved publication window does not provide both a start and end year. Evidence potential is zero because the reviewed concepts produce no scored indication. These are the recorded inputs and algorithm results; the handoff does not fill missing dates or change concepts. Empty P0 queues are preserved without lowering thresholds or inventing indications to create high-priority papers.

## Responsibilities

- **B**: Replay first, then inspect component scores, review opportunities and P0/P1/P2 destinations for every work. Explain the score effect of the three added question-match sets. Preserve approved weights and thresholds; fix assessment/ranking defects in the owning module when identified.
- **C**: Independently determine whether the three added question-match sets have sufficient support in abstracts and exact quotations, and add relevance labels. A quotation's existence does not establish research-question relevance; `potentially_relevant` scope does not mean final inclusion.
- **A**: This package completes the eight-paper scoring handoff. Maintain approved inputs, model instructions, calls and Session wiring in response to B/C findings. Omission assessment over the full discovery pool and full-text evidence coverage require their own material and cannot be declared passed from this package.

Detailed call comparisons are in the [fixed-sample review record](../../../开发记录/2026-10-20-zhouzhixian2021-候选语义审核固定样本复验.md); team sequencing is in the [work plan](../../../模块分工/academic-candidate-semantic-review-optimization-team-plan.md).
