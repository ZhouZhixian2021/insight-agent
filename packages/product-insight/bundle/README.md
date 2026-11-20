---
description: "Add a selectable product insight preset to the DSH Web profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-product-insight-bundle

New plans use optional `sourceCriteria` only for page declarations that sources are expected to publish. Broad market or release-period prose stays in the scope and questions; it is not an exact-match page metadata label.

English | [中文](README.zh.md)

## Summary

Product Insight appears in the Web preset selector. It asks users to confirm investigation directions and optional sites, then submits a bounded plan for approval. After approval, a background job searches and reads pages, checks source excerpts, and saves a cited report or a draft with explicit gaps. The transcript card displays progress and lets users start a narrower follow-up from an unanswered question. The preset uses its own public Web providers; changing its configuration requires restarting the service and opening a new conversation.

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

The shipped Web profile loads this bundle after the Academic bundle. Select **Product Insight / 产品洞察** when starting a new task. The agent screens the request briefly and asks once for two answers in one card: the focus directions as a multi-select, and whether they want to read any site of their own; the plan then presents the product, scope, confirmed directions, any site they named, questions, source approach, any region, version or source-date requirements, candidate-page limit, and expected result with a structured execution block. Focus directions come from the fixed vocabulary (performance, comparison, commercial information, availability, ecosystem, usage conditions, support, risk) and the user may add their own wording. The plan constrains directions, not websites: the official site is the only fixed domain through `product.officialUrl`, other pages are discovered by search and read by direction relevance, and `additionalSites` takes only sites the user names in conversation. The user can approve or request revisions. After approval, the transcript shows a four-stage Product Insight card for page acquisition, evidence extraction, semantic review, and report generation. It also shows counts and blockers, and exposes the saved report for reading or Markdown download. Approval concludes the planning turn. The host starts the saved plan once, and the transcript displays its progress and canonical report without a completion-triggered chat response. If that task is interrupted, another explicit call for the same approved plan resumes committed work, including completed page fragments; a later investigation request starts with a new plan. Search and fetch use the configured DSH Web providers.

After a run settles, its transcript card lists questions with no admitted conclusion. Each question can fill an editable follow-up in the empty composer; an existing draft stays intact. Sending that follow-up begins a new plan review and, after approval, a separate investigation. Historical runs without structured unanswered questions keep their saved report without follow-up controls.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

[The preset patch](presets/product.patch.yml) declares the persona, plan mode, question tool, provider-neutral Web tools, and the product workflow plugin. The planning section requires one `ask_user_question` call whose two questions confirm the focus directions and offer to add the user's own sites before a plan exists, and a proposed `product-insight-plan-json` block is checked before review; version 2 accepts only vocabulary direction ids and user-named sites. The workflow tool rechecks the durable approval before using Web and model services. [The Web patch](web.patch.yml) injects the feature-owned transcript projection. It folds durable product workflow events through the Conversation Definition/slot boundary, so live updates and replayed sessions render the same card without changing a shared framework prompt or UI component.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Product source](../source/README.md) provides a separate programmatic candidate discovery interface.
- [DSH Web](../../web/web/README.md) documents provider selection.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the product preset plugins that supply planning instructions and tools.

#### KV Cache effect

The preset changes the persona and available tools; later turns in the same conversation retain that composition.

## Known Limitations and Deferred Work

- The background job remains process-local and belongs to the Agent. A process restart leaves its saved state readable as interrupted; an explicit new call resumes the latest complete checkpoint for that plan. Automatic continuation remains separate work. The transcript card is a Session projection rather than an independent task-control page. Final status does not require independent corroboration and does not establish publisher independence or product behavior. Historical comparison records remain readable.
- Open direction-based discovery means external sites are no longer reviewed one by one: the report cites unregistered sites under the confirmed directions and discloses their count per question, so readers still judge site credibility themselves. Sites the user types into the question card enter the reading range through `additionalSites`; there is no pickable site list, and an approved plan cannot gain a site without cancelling and planning again.
- The preset requires the Web and base bundles and a configured search provider.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep product transcript presentation in this bundle and durable investigation state in the workflow package. Add fields through Session events and the projection instead of coupling the card to an Agent response.

</details>

Product mode owns its job controller and does not mount the generic job-completion notifier. New approved plans start after the planning turn becomes idle; rejected or dismissed plans do not start. Restart the service and open a new product session to test the updated preset. Historical saved reports remain readable; unfinished historical plans are not silently restarted.

Generated sentence citations render as clickable superscript numbers in chat and exported HTML, linking to the corresponding source. Markdown downloads retain numbered footnotes. The synthesis model supplies citation positions and the workflow validates their identities; historical paragraph-end links are not relocated automatically.

Synthesis Trace details expose accepted question IDs, per-question validation failures and automatic normalization notes when recorded. Older results without these diagnostics remain readable.

The chat card opens with the report body collapsed and both downloads available. Wide tables scroll within the expanded preview. Draft and blocked deliveries show their reasons. Coverage, evidence and search-scope appendices are collapsed in both chat and HTML. Saved regional price pairs with explicit regular and education amounts are labelled separately on display and download, retaining their source links.

New reports use Markdown section headings. The renderer also recognizes the historical coverage wrapper while keeping arbitrary HTML disabled.
