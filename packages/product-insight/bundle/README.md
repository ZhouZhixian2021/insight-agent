---
description: "Add a selectable product insight preset to the DSH Web profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-product-insight-bundle

New plans use optional `sourceCriteria` only for page declarations that sources are expected to publish. Broad market or release-period prose stays in the scope and questions; it is not an exact-match page metadata label.

English | [中文](README.zh.md)

## Summary

This bundle adds Product Insight to the Web agent preset selector. The preset presents an investigation plan for review. After approval, the host starts a Session-owned background job for Web discovery, page acquisition, exact excerpt checks, semantic support review, cross-site comparison, and report delivery checks. An inline transcript card projects those Session events into live stages, counters, blockers, and the saved Markdown report, so progress remains visible without relying on an Agent status message. The job saves a cited report when ready or a draft with blockers; evidence, comparison, claim, report, and task-state records remain in the owning Session.

The product preset owns an isolated Web registry with product-free-search and product-public-page. Planning tools and background investigation use these providers without requiring dsh-web-tools; other presets retain their own search configuration. Restart the server and create a new product-insight conversation after changing this preset.

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

The shipped Web profile loads this bundle after the Academic bundle. Select **Product Insight / 产品洞察** when starting a new task. The agent presents the product, scope, questions, source approach, approved external publishers and any region, version or source-date requirements, candidate-page, per-page text, gap-search and elapsed-time limits, and expected result with a structured execution block. The official site is approved through `product.officialUrl`; `sourcePublishers` lists only external publishers with domains that do not overlap the official host. The user can approve or request revisions. After approval, the transcript shows a five-stage Product Insight card for page acquisition, evidence extraction, semantic review, independent verification, and report generation. It also shows counts and blockers, and exposes the saved report for reading or Markdown download. Approval concludes the planning turn. The host starts the saved plan once, and the transcript displays its progress and canonical report without a completion-triggered chat response. If that task is interrupted, another explicit call for the same approved plan resumes committed work, including completed page fragments; a later investigation request starts with a new plan. Search and fetch use the configured DSH Web providers.

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

Indirectly, through the product preset plugins. During planning, the agent must identify the product and questions, describe the verification approach and candidate-page, per-page text, gap-search and elapsed-time limits, and present the complete plan with one structured block through `exit_plan_mode`. After approval, the host starts the investigation and the transcript displays the saved report or draft with explicit gaps. `run_product_investigation` is reserved for an explicit resume request; `cancel_product_investigation` stops the active task on request. These tools end their turn instead of asking the model to rewrite the result.

#### KV Cache effect

Selecting this preset changes its persona, planning instructions, and tool schemas relative to another preset; repeated turns in one session keep the same composition.

Chat renders formatted report text. Evidence and diagnostic appendices are collapsed by default and remain available in Markdown and self-contained HTML downloads. Rendering does not call a model or change delivery decisions.

## Known Limitations and Deferred Work

- The background job remains process-local and belongs to the Agent. A process restart leaves its saved state readable as interrupted; an explicit new call resumes the latest complete checkpoint for that plan. Automatic continuation remains separate work. The transcript card is a Session projection rather than an independent task-control page. Final status requires cross-site corroboration without unresolved conflicts; it does not establish publisher independence or product behavior.
- The preset requires the Web and base bundles and a configured search provider.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep product transcript presentation in this bundle and durable investigation state in the workflow package. Add fields through Session events and the projection instead of coupling the card to an Agent response.

</details>

Product mode owns its job controller and does not mount the generic job-completion notifier. New approved plans start after the planning turn becomes idle; rejected or dismissed plans do not start. Restart the service and open a new product session to test the updated preset. Historical saved reports remain readable; unfinished historical plans are not silently restarted.
