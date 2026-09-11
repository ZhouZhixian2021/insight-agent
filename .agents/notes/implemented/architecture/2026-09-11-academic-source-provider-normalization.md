# Agent Note: Academic source provider normalization - Crossref and arXiv

Status: implemented

English | [中文](2026-09-11-academic-source-provider-normalization.zh.md)

## Problem

The academic source seam needs more than one provider to prove its vocabulary is provider-neutral. Crossref and arXiv differ from OpenAlex in wire format (Crossref is JSON, arXiv is Atom XML) and in what each record represents: Crossref indexes formally published works, arXiv hosts preprints. Each must arrive at the same shared `AcademicWork`/`WorkVersion` pair and, crucially, the same normalized external identifiers, or ingestion cannot merge records of one work across providers.

## Decision

Both providers are separate packages registering into `ctx.academicSource`, mirroring the OpenAlex provider's structure (normalizer + network provider + namespace plugin). They differ only in the wire mapping:

1. `@deepseek-ai/dsh-academic-source-crossref` queries `GET {base}/works?query=…&rows=…` and normalizes each `message.items[]` entry. Its only external identifier is the DOI, folded to a lowercase bare form so it canonicalizes against OpenAlex and arXiv DOI keys. Crossref `type` maps to publication state: `posted-content` → preprint, the metadata types → published, anything else → unknown.
2. `@deepseek-ai/dsh-academic-source-arxiv` queries `GET {base}/api/query?search_query=all:…&max_results=…` and parses the Atom feed with `fast-xml-parser`. Every entry is a preprint version recording no journal venue; its `arxiv` identifier strips the host and `vN` suffix so all versions of one paper key the same way, and an optional `arxiv:doi` becomes a `doi` identifier so ingestion can merge the preprint with the publisher's version.

The DOI normalization is shared by convention, not by a helper import: each provider lowercases to the same bare form, matching the `externalIdentifierDedupKey` contract that caller-normalized values are the deduplication key.

## Package topology

```text
@deepseek-ai/dsh-academic-source  <--registers--  @deepseek-ai/dsh-academic-source-crossref
        ctx.academicSource                         (id: crossref)
                                 <--registers--  @deepseek-ai/dsh-academic-source-arxiv
                                                  (id: arxiv)
```

Each provider depends on `dsh-academic-source` and `dsh-academic-model` only; neither imports the other provider.

## Alternatives considered

### One combined multi-provider package

Rejected. The seam's whole point is that providers swap and version independently, as the OpenAlex package already established; folding Crossref and arXiv in would recouple their wire formats.

### Reuse a single cross-provider DOI normalizer

Rejected for now. The normalization is a one-line lowercase fold repeated per provider; a shared helper would add a package boundary over a trivial rule while the canonical form is still "lowercase bare DOI". Revisit when a third provider needs more than DOI folding.

## Consequences

**Identifiers, not wire shapes, decide merging.** Crossref contributes only a DOI; arXiv contributes an `arxiv` id plus an optional DOI. Ingestion links records across providers through the DOI deduplication key, which is why the folded form must match exactly.

**arXiv is preprint-only.** Its version type and publication status are always `preprint`; the publisher's version arrives through another provider and merges by DOI.

**One XML parser dependency.** `fast-xml-parser` is the single maintained parser this provider uses; it is already present in the repository's dependency graph, so no new native or hand-rolled XML code is owned.

## Deferred work

- Crossref retraction detection via `update-to` links.
- arXiv `start`-based pagination past `max_results`.
- A shared identifier-normalization helper if a third provider needs more than DOI folding.
