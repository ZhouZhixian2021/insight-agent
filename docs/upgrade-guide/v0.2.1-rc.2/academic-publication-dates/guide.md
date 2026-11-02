---
kind: upgrade-guide
description: "Academic plans must declare date semantics before running an ambiguous legacy date window."
---

# Academic publication dates

English | [中文](guide.zh.md)

## Change

Academic plan version 6 declares date upper-bound semantics and rule ownership. A null end date no longer lets a model invent the current date. Starting an older plan with a null upper bound and unclassified date rules now requires renewed approval. Historical plans, logs and reports remain readable and are not rewritten. Current runs persist a versioned date-context event; older readers safely reject that unknown event rather than interpreting it incorrectly.

## Migration

1. Ask Academic Insight to revise the plan using the [current Brief template](../../../../packages/bundle/web-app/presets/academic/skills/academic-insight-report/references/research-brief.md).
2. Choose `publicationDatePolicy.endMode`: `fixed` with an explicit `publicationWindow.end`, `run_start` with a null end, or `unbounded` with a null end. Set an approved IANA `timeZone`. Classify each rule in `inclusionRuleKinds` and `exclusionRuleKinds` as `content` or `publication_date`; split mixed rules.
3. Review and approve the revised plan, then start a new run. Check its report retrieval disclosure for the date window, date basis, time zone and original start. A resumed run keeps its original saved cutoff.
