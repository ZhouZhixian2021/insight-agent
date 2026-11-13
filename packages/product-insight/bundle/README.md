---
description: "Add a selectable product insight preset to the DSH Web profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-product-insight-bundle

New plans use optional `sourceCriteria` only for page declarations that sources are expected to publish. Broad market or release-period prose stays in the scope and questions; it is not an exact-match page metadata label.

English | [中文](README.zh.md)

## Summary

This bundle adds Product Insight to the Web agent preset selector. After plan approval, a Session-owned background job searches approved sources, extracts and reviews evidence, checks independent support, and saves a cited report or a draft with blockers. A transcript card shows live stages, counts, Trace and the saved report.

The preset currently selects local multi-engine `product-free-search` and `product-public-page` acquisition; the installed-plugin search bridge remains available for explicit selection.

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

The shipped Web profile loads this bundle after the Academic bundle. Select **Product Insight / 产品洞察** when starting a new task. The agent presents the product, scope, questions, source approach, approved external publishers and any region, version or source-date requirements, candidate-page, per-page text, gap-search and elapsed-time limits, and expected result with a structured execution block. The official site is approved through `product.officialUrl`; `sourcePublishers` lists only external publishers with domains that do not overlap the official host. The user can approve or request revisions. After approval, the transcript shows a four-stage Product Insight card for page acquisition, evidence extraction, semantic review, and report generation. It also shows counts and blockers, and exposes the saved report for reading or Markdown download. Approval concludes the planning turn. The host starts the saved plan once, and the transcript displays its progress and canonical report without a completion-triggered chat response. If that task is interrupted, another explicit call for the same approved plan resumes committed work, including completed page fragments; a later investigation request starts with a new plan. Search and fetch use the configured DSH Web providers.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

[The preset patch](presets/product.patch.yml) declares the persona, plan mode, question tool, provider-neutral Web tools, and the product workflow plugin. A proposed `product-insight-plan-json` block is checked before review. The workflow tool rechecks the durable approval before using Web and model services. [The Web patch](web.patch.yml) injects the feature-owned transcript projection. It folds durable product workflow events through the Conversation Definition/slot boundary, so live updates and replayed sessions render the same card without changing a shared framework prompt or UI component.

The product preset owns an isolated Web registry. Planning tools and background investigation use local `product-free-search` while retaining `product-public-page` for page retrieval. Search recognition and background model calls use the session-selected model without a backup route. The installed `dsh-web-tools` search bridge remains available for explicit selection; other presets retain their own search configuration. Restart the server and create a new product-insight conversation after changing this preset.

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

## Known Limitations and Deferred Work

- The background job remains process-local and belongs to the Agent. A process restart leaves its saved state readable as interrupted; an explicit new call resumes the latest complete checkpoint for that plan. Automatic continuation remains separate work. The transcript card is a Session projection rather than an independent task-control page. Final status does not require independent corroboration and does not establish publisher independence or product behavior. Historical comparison records remain readable.
- The preset requires the Web and base bundles and a configured search provider.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep product transcript presentation in this bundle and durable investigation state in the workflow package. Add fields through Session events and the projection instead of coupling the card to an Agent response.

Search route record: on 2026-11-10, vivo investigations received repeated HTTP 202 responses and unrecognized HTML from the free search endpoint, so the preset temporarily used the installed plugin. The preset has now been switched back to `product-free-search` as requested, while retaining the source plugin and `fetchProvider: product-public-page`; the installed-provider bridge remains selectable. Restart Web and use a new Product Insight conversation to verify both planning search and background discovery.

</details>

Product mode owns its job controller and does not mount the generic job-completion notifier. New approved plans start after the planning turn becomes idle; rejected or dismissed plans do not start. Restart the service and open a new product session to test the updated preset. Historical saved reports remain readable; unfinished historical plans are not silently restarted.

Generated sentence citations render as clickable superscript numbers in chat and exported HTML, linking to the corresponding source. Markdown downloads retain numbered footnotes. The synthesis model supplies citation positions and the workflow validates their identities; historical paragraph-end links are not relocated automatically.
