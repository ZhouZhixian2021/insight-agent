# Agent Note: Web Academic discovery uses OpenAlex and arXiv

Status: implemented

English | [中文](2026-09-19-web-academic-discovery-sources.zh.md)

## Problem

The Web Academic composition registered arXiv and three venue-directory providers, while the source runtime searched every usable provider when no discovery list was configured. The venue catalogs covered configured 2025 pages instead of a general historical corpus, and their failures obscured whether one bounded research run could discover the approved 2017–2020 papers. The merged OpenAlex provider was not mounted by the Web composition, so its discovery results could not reach the workflow.

## Decision

The shipped Web composition mounts the OpenAlex provider and configures `searchProviders` as `openalex` and `arxiv`, with a 25000 ms deadline for each provider search. The single-provider `searchProvider` remains `arxiv` for callers of `search()`.

ACL Anthology, CVF, and PMLR remain mounted because their registered records can resolve known full-text locations. They are not members of the Web discovery list. OpenAlex receives no publication-year filter: its aggregate publication date does not establish `first_public_release`, and strict date eligibility continues to require an authoritative source. Each provider receives the unchanged query without planning; the [bounded transport retry decision](../bug-fix/2026-09-20-academic-source-transient-transport-retries.md) lets arXiv and OpenAlex repeat only transient transport attempts.

The Web composition configures the built-in `web-fetch-http` provider with a 120000 ms timeout, a 5000000-byte response limit, and a 1000000-character decoded-body limit. Academic evidence preparation rejects truncated HTML and incomplete PDFs, while both fixed acceptance papers exceed the provider's former 100000-character default. The model-facing Web tool retains its own shorter call budget.

## Alternatives considered

**Use OpenAlex alone.** Rejected because OpenAlex deliberately leaves `first_public_release` unknown, so a strict first-release window can exclude every OpenAlex-only candidate even when discovery succeeds.

**Use arXiv alone.** Rejected because it gives up OpenAlex's broader discovery and publisher-location metadata.

**Search every registered provider.** Rejected because the configured venue catalogs are bounded directory resolvers rather than a complete historical search corpus. Their participation made actual source coverage depend on unrelated catalog pages.

**Remove the venue providers from Web.** Rejected because they still resolve full-text locations for records that identify those providers. Discovery selection does not require removing resolver registrations.

## Consequences

Web Academic runs report `arxiv` and `openalex` as their actual discovery providers, isolate each provider behind the configured deadline, and retain venue resolvers for known records. A provider failure can remain a partial batch result.

Discovery success does not guarantee that an approved paper survives the per-query aggregate bound, the cross-query candidate bound, metadata eligibility, or full-text selection. The fixed Transformer and BERT acceptance run therefore distinguishes successful wiring from research-content acceptance and keeps query planning as a separate decision.

A later profile or plugin can select another default `ctx.web.fetch` provider. Providers that convert HTML to plain text or reject PDFs do not satisfy the Academic evidence preparer's raw HTML/PDF requirement even though they implement the general Web fetch interface. Explicit Academic fetch-provider selection remains deferred; deployments running the current controller must keep the built-in `http` provider selected for Academic full-text acquisition.
