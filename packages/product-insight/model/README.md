---
description: "Shared product identities, investigation records, evidence links, and pure approval and freshness checks for product insight."
kind: "package-library"
---

# @deepseek-ai/dsh-product-insight-model

English | [中文](README.zh.md)

## Summary

Product-insight packages can exchange one versioned plan, screened page, captured source, evidence record, and cited conclusion through this library. It creates opaque IDs and checks exact-version approval, batch outcomes, and whether cited page content has changed. It performs no search, fetch, model call, persistence, or report rendering.

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

Source, workflow, report, controller, and browser packages will consume its public [entry](src/index.ts) as they are built. `isExecutableProductPlan()` accepts only approval for the plan's current version. `createProductBatchResult()` retains successful records alongside failures, including an empty successful search. `checkProductClaimFreshness()` compares a conclusion's plan and content hashes with current evidence and page snapshots; `current` does not certify the conclusion's meaning or permit report delivery.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[Types](src/types.ts) separate a discovered page from each successful or failed fetch; only a successful snapshot carries content and its hash. A plan can approve a per-page text allowance, a bounded number of question-targeted gap searches, external publishers, and explicit region, version, and date criteria; an available snapshot can retain page-declared publisher, dates, region, and version without treating absent fields as known. Evidence retains the exact source snapshot, while a conclusion records the plan version and content identities used for analysis. [IDs](src/ids.ts) use branded UUIDs. The [freshness check](src/claim-freshness.ts) reports known changes as stale and missing observations as unverifiable, without mutating stored conclusions.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Product insight subsystem](../../../docs/subsystems/product-insight.md) defines the shared record semantics.
- [Team field agreement](../../../z-team_docs/产品洞察/接口约定/00-首版共享字段方案.md) records the A/C handoff and first investigation scope.

-----

<a id="model-experience"></a>
## Model Experience

None, as this library only defines caller-owned records and pure decisions; it makes no model request and renders no model-visible text.

#### KV Cache effect

No direct effect; future consumers own any serialization of these records into model requests.

## Known Limitations and Deferred Work

- **No semantic review** — freshness checks source identity and content changes only; report consumers must inspect whether evidence actually supports a conclusion.
- **No wire validation** — parsers and Remote consumers must validate untrusted or persisted values before using these TypeScript records.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Controller, report, and browser presentation remain separate product-insight work; this model package does not imply a complete product investigation flow.

</details>
