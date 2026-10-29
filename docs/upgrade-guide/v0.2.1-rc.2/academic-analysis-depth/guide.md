---
kind: upgrade-guide
description: Academic analysis removes fixed item caps while retaining model response budgets and evidence validation.
---

# Academic analysis depth and removed count exports

English | [中文](guide.zh.md)

## Change

The academic-analysis package no longer exports `MAX_SYNTHESIS_STATEMENTS`, `MAX_SYNTHESIS_STATEMENTS_PER_QUESTION` or `MAX_SYNTHESIS_EVIDENCE_LINKS`. The parser accepts larger evidence-backed reports without fixed item caps. Prompts request technical explanations within the configured complete-response token budget. Evidence checks and finite workflow recovery remain effective; this change does not increase model output settings or request counts.

## Migration

1. Remove imports of the three count constants. Do not use fixed item counts to infer report completeness; inspect question coverage and evidence instead.
2. Keep the consuming workflow's model token budget, cancellation and finite retries. A response stopped at its output limit remains incomplete and cannot be parsed as a complete report.
3. Re-run fixed-material comparisons to assess technical content and token usage. Existing saved drafts remain readable; new prompts apply only to new model requests.
