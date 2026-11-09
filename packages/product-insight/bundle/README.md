---
description: "Add a selectable product insight preset to the DSH Web profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-product-insight-bundle

English | [中文](README.zh.md)

## Summary

This bundle adds Product Insight to the Web agent preset selector. The preset presents an investigation plan for review. After approval, its Agent tool starts a Session-owned background job for Web discovery, page acquisition, exact excerpt checks, semantic support review, cross-site comparison, and report delivery checks. An inline transcript card projects those Session events into live stages, counters, blockers, and the saved Markdown report, so progress remains visible without relying on an Agent status message. The job saves a cited report when ready or a draft with blockers; evidence, comparison, claim, report, and task-state records remain in the owning Session.

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

The shipped Web profile loads this bundle after the Academic bundle. Select **Product Insight / 产品洞察** when starting a new task. The agent presents the product, scope, questions, source approach, approved external publishers and any region, version or source-date requirements, candidate-page, per-page text, gap-search and elapsed-time limits, and expected result with a structured execution block. The official site is approved through `product.officialUrl`; `sourcePublishers` lists only external publishers with domains that do not overlap the official host. The user can approve or request revisions. After approval, the transcript shows a five-stage Product Insight card for page acquisition, evidence extraction, semantic review, independent verification, and report generation. It also shows counts and blockers, and exposes the saved report for reading or Markdown download. The agent calls `run_product_investigation`, uses `job_output` for progress, then reads the cited report or draft with `get_product_investigation`, disclosing gaps and uncertainty. If that task is interrupted, another explicit call for the same approved plan resumes committed work, including completed page fragments; a later investigation request starts with a new plan. Search and fetch use the configured DSH Web providers.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

[The preset patch](presets/product.patch.yml) declares the persona, plan mode, question tool, provider-neutral Web tools, and the product workflow plugin. A proposed `product-insight-plan-json` block is checked before review. The workflow tool rechecks the durable approval before using Web and model services. [The Web patch](web.patch.yml) injects the feature-owned transcript projection. It folds durable product workflow events through the Conversation Definition/slot boundary, so live updates and replayed sessions render the same card without changing a shared framework prompt or UI component.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Product source](../source/README.md) provides a separate programmatic candidate discovery interface.
- [DSH Web](../../web/web/README.md) documents provider selection.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the product preset plugins. During planning, the agent must identify the product and questions, describe the verification approach and candidate-page, per-page text, gap-search and elapsed-time limits, and present the complete plan with one structured block through `exit_plan_mode`. After approval, `run_product_investigation` returns a job ID; the agent reads job progress and then retrieves the cited report or draft with explicit gaps.

#### KV Cache effect

Selecting this preset changes its persona, planning instructions, and tool schemas relative to another preset; repeated turns in one session keep the same composition.

## Known Limitations and Deferred Work

- The background job remains process-local and belongs to the Agent. A process restart leaves its saved state readable as interrupted; an explicit new call resumes the latest complete checkpoint for that plan. Automatic continuation remains separate work. The transcript card is a Session projection rather than an independent task-control page. Final status requires cross-site corroboration without unresolved conflicts; it does not establish publisher independence or product behavior.
- The preset requires the Web and base bundles and a configured search provider.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep product transcript presentation in this bundle and durable investigation state in the workflow package. Add fields through Session events and the projection instead of coupling the card to an Agent response.

</details>
