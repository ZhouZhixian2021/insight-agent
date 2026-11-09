---
description: "Product insight package group for shared investigation records and the planned source-to-report workflow."
kind: "package-group"
---

# packages/product-insight

English | [中文](README.zh.md)

## Summary

The product-insight group keeps product investigation code under one directory. The model package provides shared records, the source package discovers and verifies pages, the workflow reviews excerpts and cross-site statements before assessing cited report delivery, and the bundle adds a selectable Web preset with plan review and a Session-owned background job. Its progress is available through generic job tools and its saved result through `get_product_investigation`. A dedicated report view remains future work.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role |
| --- | --- |
| [`model`](model/README.md) | Shared product, plan, page, evidence, claim, run, and report records with pure approval and freshness checks |
| [`source`](source/README.md) | Bounded Web search, candidate screening, page snapshots, and exact excerpt verification |
| [`workflow`](workflow/README.md) | Approved investigation orchestration, semantic support review, provisional claims and report delivery checks |
| [`bundle`](bundle/README.md) | Selectable Product Insight preset that runs a cited report or draft after plan approval |

The other three directories contain placeholders and are not published packages yet. Their planned responsibilities are in the [team code layout](../../z-team_docs/产品洞察/01-代码目录规划.md).

-----

<a id="related-documentation"></a>
## Related documentation

- [Product insight subsystem](../../docs/subsystems/product-insight.md) describes the current shared records and dependency direction.
- [Team field agreement](../../z-team_docs/产品洞察/接口约定/00-首版共享字段方案.md) records the first investigation scope.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The [module ownership](../../z-team_docs/产品洞察/模块分工/00-模块分工.md) assigns A and C their future package work.

</details>
