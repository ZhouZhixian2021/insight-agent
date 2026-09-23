---
description: "Search configured ACL Anthology volumes and resolve each matched paper to its official PDF."
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-acl

English | [中文](README.zh.md)

## Summary

This package adds ACL Anthology papers to `ctx.academicSource`. It searches configured official volume pages, normalizes matching papers, and returns direct Anthology PDFs for the shared evidence pipeline.

`verifyReference()` fetches one official paper page by Anthology ID and checks its citation metadata before returning a work. This works without configured volume catalogs; it does not fetch the PDF.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it after `dsh-academic-source` and list the ACL Anthology volumes this deployment searches.

```yaml
- name: '@deepseek-ai/dsh-academic-source-acl'
  config:
    catalogUrls: ['https://aclanthology.org/2025.acl-long/']
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `https://aclanthology.org` | Base used to resolve paper PDFs. |
| `catalogUrls` | `[]` | Official Anthology volume pages; an empty list makes the provider unavailable. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-academic-source-acl) is the exhaustive field reference.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The provider reuses the shared catalog fetch, filtering, and normalization helper. Its parser recognizes Anthology paper ids and titles; the provider appends `.pdf` to the validated record id. The provider declares its catalog-only coverage through the `limitations` field, surfaced by `searchAll()`. Deduplication and body parsing remain in `academic-ingestion` and `academic-evidence`.

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
- Catalog parsing currently records no author names because the title link is the stable minimal page structure used here.
- A markup change can require a focused parser update.

<a id="dev-note"></a>
### Dev Note

No invariant companion is published because this provider owns no independently maintained runtime observations; catalog parsing and result mapping are checked by focused tests.
