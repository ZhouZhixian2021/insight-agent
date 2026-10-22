# Agent Note: Multi-source academic providers share search and full-text plumbing

Status: implemented

English | [中文](2026-09-16-multi-source-academic-providers.zh.md)

## Problem

Academic research needs papers from arXiv, CVF Open Access, ACL Anthology, and PMLR. Copying aggregation, normalization, deduplication, and full-text dispatch into every source would make each additional venue a cross-package change.

## Decision

`@deepseek-ai/dsh-academic-source` owns provider registration, `searchAll()`, fair round-robin result bounding, shared catalog filtering and normalization, and `resolveFullText()`. Every provider implements only availability, source search, record parsing, and ordered full-text URL derivation.

arXiv keeps its Atom API integration. CVF, ACL Anthology, and PMLR search configured official catalog pages because those sites do not expose one common query API suitable for this runtime. The Web composition owns the concrete conference and volume URL list, so adding a catalog is configuration rather than another runtime branch.

Provider results still enter `academic-ingestion`, which owns exact-identifier and suspected-duplicate handling. Resolved URLs still enter `academic-evidence`, which owns HTML/PDF fetching and parsing. Source packages do not duplicate either responsibility.

## Package topology

```text
source <- source-arxiv | source-cvf | source-acl | source-pmlr
  |
  +-> ingestion -> evidence -> workflow/controller
```

## Alternatives considered

**One large source package.** Rejected because unrelated site parsers and configuration would change together, and one site failure would be harder to isolate.

**A generic “enter any website URL” crawler.** Rejected because publication sites expose incompatible markup, identifiers, and PDF rules. A small provider is the minimum honest adapter.

**Metadata-only providers.** Rejected for this workflow because a result without a resolvable full text cannot contribute evidence to the report.

## Consequences

Adding a source requires one provider package with a parser, URL rule, focused test, and composition row. Adding another catalog for an existing provider requires only configuration. Catalog-backed search is limited to configured pages and currently fetches them on each query; caching waits for measured need.

The focused provider/runtime/controller suites cover aggregation, parsing, normalization, and PDF resolution. Live smoke checks on 2026-09-16 returned papers and PDF candidates from all four providers; ACL succeeded against a smaller official volume after its unquoted production links were added to the parser test, while the configured multi-megabyte main volume remained slower than the short smoke-test window.
