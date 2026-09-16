# Agent Note: Academic source provider normalization - arXiv

Status: implemented

English | [中文](2026-09-11-academic-source-provider-normalization.zh.md)

## Problem

The academic source seam needs each provider to translate its wire response into the same shared `AcademicWork`/`WorkVersion` pair and normalized external identifiers. arXiv exposes Atom XML records for preprints, including versioned arXiv ids and optional DOI values that ingestion can use for version linking.

## Decision

`@deepseek-ai/dsh-academic-source-arxiv` is a separate package registering into `ctx.academicSource`, with a normalizer, network provider, and namespace plugin. It queries `GET {base}/api/query?search_query=all:…&max_results=…` and parses the Atom feed with `fast-xml-parser`. Every entry is a preprint version recording no journal venue; its work-level `arxiv` identifier strips the host and `vN` suffix so all versions key the same work, while the version retains the suffixed record id, `vN` label, and Atom `updated` date. An optional `arxiv:doi` becomes a work-level `doi` identifier so ingestion can merge the preprint with a version discovered by another full-text provider.

The DOI normalization is shared by convention, not by a helper import: each provider lowercases to the same bare form, matching the `externalIdentifierDedupKey` contract that caller-normalized values are the deduplication key.

## Package topology

```text
@deepseek-ai/dsh-academic-source  <--registers--  @deepseek-ai/dsh-academic-source-arxiv
        ctx.academicSource
                                                  (id: arxiv)
```

Each provider depends on `dsh-academic-source` and `dsh-academic-model` only; neither imports the other provider.

## Alternatives considered

### One combined multi-provider package

Rejected. The seam's whole point is that providers swap and version independently, as the OpenAlex package already established; folding Crossref and arXiv in would recouple their wire formats.

### Reuse a single cross-provider DOI normalizer

Rejected for now. The normalization is a one-line lowercase fold repeated per provider; a shared helper would add a package boundary over a trivial rule while the canonical form is still "lowercase bare DOI". Revisit when a third provider needs more than DOI folding.

## Consequences

**Identifiers, not wire shapes, decide merging.** arXiv contributes an `arxiv` id plus an optional DOI. Ingestion can link records from future full-text providers through the DOI deduplication key, which is why the folded form must match exactly.

**arXiv is preprint-only.** Its version type and publication status are always `preprint`; each revision remains addressable by its suffixed id, and the publisher's version arrives through another provider and merges by DOI.

**One XML parser dependency.** `fast-xml-parser` is the single maintained parser this provider uses; it is already present in the repository's dependency graph, so no new native or hand-rolled XML code is owned.

## Deferred work

- arXiv `start`-based pagination past `max_results`.
- A shared identifier-normalization helper if a third provider needs more than DOI folding.

The Crossref implementation described by the original decision was removed by [the metadata-only provider decision](../simplification/2026-09-16-remove-metadata-only-academic-providers.md).
