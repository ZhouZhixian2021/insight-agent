---
description: "Search configured PMLR volumes and resolve each matched paper to its official PDF."
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-pmlr

English | [中文](README.zh.md)

## Summary

This package adds PMLR papers to `ctx.academicSource`. It searches configured official volume pages, normalizes matching papers, and returns their canonical PDFs for the shared evidence pipeline.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it after `dsh-academic-source` and list the PMLR volumes this deployment searches.

```yaml
- name: '@deepseek-ai/dsh-academic-source-pmlr'
  config:
    catalogUrls: ['https://proceedings.mlr.press/v267/']
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `https://proceedings.mlr.press` | Base used to resolve paper PDFs. |
| `catalogUrls` | `[]` | Official PMLR volume pages; an empty list makes the provider unavailable. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-academic-source-pmlr) is the exhaustive field reference.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The provider reuses the shared catalog fetch, filtering, and normalization helper. Its parser extracts each paper block and abstract path; the provider derives the matching canonical PDF path. Deduplication and body parsing remain in `academic-ingestion` and `academic-evidence`.

</details>

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the Academic research workflow; this provider adds no prompt or model schema.

#### KV Cache effect

No direct invalidation; the workflow owns ordering and prompt serialization.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Search covers only configured volume pages and performs no site-wide crawl.
- Pages are fetched for every search; add caching only if measured traffic requires it.
- A markup change can require a focused parser update.

<a id="dev-note"></a>
### Dev Note

None.
