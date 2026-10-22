# Agent Note: Remove metadata-only academic providers

Status: implemented

English | [中文](2026-09-16-remove-metadata-only-academic-providers.zh.md)

## Problem

The Academic research workflow analyzes locatable full text. The OpenAlex and Crossref providers returned normalized bibliography records but supplied no HTML or PDF candidates, so their results could not enter the full-text evidence pipeline. Keeping those packages increased the supported provider surface without improving the shipped research pass.

## Decision

The repository ships the arXiv academic provider and removes the OpenAlex and Crossref provider packages. New providers must discover analyzable HTML or PDF candidates in addition to normalizing their records into `AcademicWork` and `WorkVersion` values. The provider-neutral source seam, ingestion deduplication, DOI identifiers, and the generic `openalex` external-identifier kind remain available because they do not perform OpenAlex or Crossref retrieval.

The provider-normalization decision remains applicable to arXiv; its Crossref-specific implementation is superseded by this removal.

## Alternatives considered

**Keep the providers disabled.** Rejected because dormant production packages still require tests, documentation, generated catalogs, and compatibility maintenance while the workflow cannot consume their results.

**Treat metadata-only records as analysis inputs.** Rejected because bibliography and abstracts cannot satisfy the workflow's locatable full-text evidence requirement.

**Add publisher PDF discovery to OpenAlex or Crossref.** Rejected because those registries do not guarantee an accessible full-text artifact. Venue repositories with direct HTML or PDF links are the appropriate provider boundary.

## Consequences

The shipped composition searches arXiv until additional full-text providers are implemented. Removing the two packages also removes their configuration entries and dependency-graph nodes. DOI-based version merging remains unchanged, and future full-text providers continue to use the existing source, ingestion, and evidence packages.
