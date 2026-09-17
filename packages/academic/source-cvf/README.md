---
description: "Search configured CVF Open Access conference catalogs and resolve each matched paper to its official PDF."
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-cvf

English | [中文](README.zh.md)

## Summary

This package adds CVF Open Access papers to `ctx.academicSource`. It searches configured official conference pages, normalizes matching papers, and returns their official PDFs for the shared evidence pipeline.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it after `dsh-academic-source` and list the CVF conference pages this deployment searches.

```yaml
- name: '@deepseek-ai/dsh-academic-source-cvf'
  config:
    catalogUrls: ['https://openaccess.thecvf.com/CVPR2025?day=all']
```

| Field | Default | Meaning |
|---|---|---|
| `catalogUrls` | `[]` | Official CVF conference catalog pages; an empty list makes the provider unavailable. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-academic-source-cvf) is the exhaustive field reference.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The provider fetches configured pages through the shared catalog helper. Its parser extracts title links and author/venue text; the provider converts each `/html/*.html` record URL to the corresponding `/papers/*.pdf` URL. The provider declares its catalog-only coverage through the `limitations` field, surfaced by `searchAll()`. Deduplication and body parsing remain in `academic-ingestion` and `academic-evidence`.

</details>

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the Academic research workflow; this provider adds no prompt or model schema.

#### KV Cache effect

No direct invalidation; the workflow owns ordering and prompt serialization.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Search covers only configured catalog pages and performs no site-wide crawl.
- Pages are fetched for every search; add caching only if measured traffic requires it.
- A markup change can require a focused parser update.

<a id="dev-note"></a>
### Dev Note

None.
