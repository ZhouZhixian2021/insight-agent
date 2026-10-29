---
kind: upgrade-guide
description: Academic screening keeps low-scoring eligible candidates and changes review and scope-reading defaults.
---

# Academic screening budgets and priority queues

English | [中文](guide.zh.md)

## Change

New Controller plans use `ACADEMIC_CANDIDATE_RANKING_POLICY_V2`: scores below 50 enter P2 instead of being excluded. Hard exclusions remain effective. V2 permits regular English trailing-s variants and treats missing lexical matches as background candidates. V1 and saved plan policies retain their interpretation.

`candidateReviewMaximumWorks` defaults to 24 instead of 8. Reviews run in configured batches; `candidateReviewGapReserve` defaults to 4 for newly discovered gap candidates, released from round two. `scopeReviewMaximumBatches` defaults to 3 instead of inspecting only the first source batch. These defaults may increase model usage and full-text processing. Unresolved scope remains paused.

## Migration

1. Review the Academic Research Controller config in `cordis.yml`. Set `candidateReviewMaximumWorks: 8` to retain the previous total review cap, `candidateReviewGapReserve: 0` to reserve no gap calls, and `scopeReviewMaximumBatches: 1` to retain one scope input.
2. Library callers requiring the old lexical exclusion floor can continue passing `ACADEMIC_CANDIDATE_RANKING_POLICY_V1`. Resume existing runs with their saved policy; do not rewrite Session records.
3. Inspect candidate rankings, review selections, and batch settlements in a new research run. Confirm eligible low-scoring works enter P2, dispatched reviews stay within the configured total, and explicit exclusions remain effective. See the [Controller configuration](../../../../packages/api/academic-research-controller/README.md).
