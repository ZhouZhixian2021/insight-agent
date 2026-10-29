---
kind: upgrade-guide
description: Academic screening keeps low-scoring eligible candidates and changes review and scope-reading defaults.
---

# Academic screening budgets and priority queues

English | [中文](guide.zh.md)

## Change

New Controller plans use `ACADEMIC_CANDIDATE_RANKING_POLICY_V2`: scores below 50 enter P2 instead of being excluded. Hard exclusions remain effective. V2 permits regular English trailing-s variants and treats missing lexical matches as background candidates. V1 and saved plan policies retain their interpretation.

`candidateReviewMaximumWorks` defaults to 24 instead of 8. Reviews run in configured batches; `candidateReviewGapReserve` defaults to 4 for newly discovered gap candidates, released from round two. `scopeReviewMaximumBatches` defaults to 3 instead of inspecting only the first source batch. These defaults may increase model usage and full-text processing. Unresolved scope remains paused.

New ranked runs additionally cap scheduled full text at 24 papers, uncertain exploration at 2 papers, and evidence-fragment attempts at 8 per paper. Missing or failed metadata review no longer grants unrestricted full-text access. Web profiles cache source files and parsed locators under DSH home; no task judgments are cached. Existing checkpoints retain their saved scheduling policy.

Metadata review now returns `schemaVersion: 2`: a relevance match no longer needs a copied passage, while an exclusion still must carry one that occurs verbatim in the title or scholarly abstract. An exclusion whose passage is missing or unverifiable becomes an undecided scope marked `downgraded: 'unverifiable_exclusion_quote'`, so the paper stays available for full-text review instead of being removed. Version 1 reviews and screening records remain readable and keep their passage requirement.

## Migration

1. Review the Academic Research Controller config in `cordis.yml`. Set `candidateReviewMaximumWorks: 8` to retain the previous total review cap, `candidateReviewGapReserve: 0` to reserve no gap calls, and `scopeReviewMaximumBatches: 1` to retain one scope input.
2. Library callers requiring the old lexical exclusion floor can continue passing `ACADEMIC_CANDIDATE_RANKING_POLICY_V1`. Resume existing runs with their saved policy; do not rewrite Session records.
3. Set `maximumFulltextWorks`, `maximumUncertainFulltextWorks` and `extractionMaximumCallsPerPaper` when defaults cannot meet your research size. Set exploration to 0 to require positive metadata review. Other compositions enable reuse with `fulltextCacheDirectory`; see [cache limits](../../../cookbook/academic-fulltext-budget-cache.md).
4. Inspect candidate rankings, review selections, and batch settlements in a new research run. Confirm eligible low-scoring works enter P2, dispatched reviews stay within the configured total, and explicit exclusions remain effective. See the [Controller configuration](../../../../packages/api/academic-research-controller/README.md).
5. Re-check any external prompt, fixture, or dashboard that pins the candidate-review instruction or expects a passage on every match. A paper the model called off-topic without a verifiable passage now appears as undecided and can still consume full-text capacity.
