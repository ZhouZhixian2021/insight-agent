---
description: "Search configured scholarly website forms using the Session's existing Playwright browser."
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-browser

English | [中文](README.zh.md)

## Summary

This optional plugin registers the Academic search provider `browser`. It fills configured website search boxes, submits queries, reads official paper pages, and normalizes their published citation metadata. Full-text candidates come from `citation_pdf_url`; the provider never constructs download URLs. It also exposes those records through the existing Web search service.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

## Use this package

Mount `dsh-academic-source`, `dsh-browser-use`, a Session-owned Playwright browser provider, and this plugin in the same profile. Configure `sites` using the [three-site configuration](examples/sites.json); choose conference and volume URLs deliberately. The current browser adapter uses the optional `dsh-experimental-browser-use-playwright-mcp` provider and its `browser_run_code_unsafe` tool. Enable that provider explicitly; this package does not start its own browser or require publisher API credentials.

Set `webDiscoverySearchProvider: browser` on the Academic research controller to use these sites only for formal paper Web discovery. Keep the source runtime and approved plans on OpenAlex/arXiv for direct search, and include `web_discovery` alongside `academic` in the plan. Ordinary `web_search` retains the shared Web provider, including during planning and in other presets. Results contain official links, titles, published abstracts when available, and coverage limits. References are verified through the existing ACL, PMLR, CVF, OpenAlex or arXiv providers before evidence acquisition. Calls outside an agent turn require `agents.withInitiator()`; the controller establishes this scope for its maintenance operation.

This plugin also registers the fetch provider `browser`. Set the Academic controller's `fulltextFetchProvider: browser` to click observed PDF links through the browser, validate PDF bytes, and pass them to the existing evidence parser. URLs belonging to other sources use `otherFetchProvider` (default `http`); failed browser downloads do not switch transports. Temporary downloads are removed after each operation; `maximumPdfBytes` (20000000) caps accepted files after download, not network transfer or temporary disk usage.

Each site specifies its search URL, coverage description, form and result selectors, paper-URL expression and allowed PDF origins. Optional `resultUrlRewrite` maps a known publisher result route to its official landing page before URL validation; the ACL example maps PDF search hits to citation-bearing HTML pages. Download URLs still come only from published citation metadata. `mode: submit` waits for navigation; `mode: filter` uses in-page filtering. Readiness selectors must include explicit empty results where applicable. Only the first results page is read; a visible next-page control marks truncation.

The limits `maximumResults` (6), `maximumCachedRecords` (1000), `operationTimeoutMs` (15000), and `maximumMetadataCharacters` (32000) are configurable. Configure the source search deadline and browser tool deadline for the complete operation, including paper-page visits. One failed site rejects the browser provider's search; other Academic providers retain their independent settlements. Requests exceeding `maximumResults` are capped. Results from configured sites share the aggregate limit round-robin.

## Understand the implementation

The plugin delegates fixed browser operations to the initiating Agent's existing DSH tool runtime. Page content never supplies executable code. Same-origin paper URLs, citation metadata, PDF origins, result counts, and metadata sizes are checked before records are published. Missing PDFs retain metadata without a full-text candidate. Unsupported metadata or access failures reject the search instead of producing fabricated papers or guessed links.

The provider retains observed PDF locations in memory for `resolveFullText()`. A full cache rejects additional records without evicting existing candidates. Unload aborts active operations, waits for them to settle, and clears those locations. Evidence parsing remains owned by Academic evidence. Chromium's Download API reports download completion without the origin HTTP status; this adapter represents a completed, validated PDF acquisition as status 200, following the existing API fetch adapter convention.

## Model Experience

Indirectly, through the Academic workflow and existing Web tools: normalized paper metadata, resolved full-text candidates, coverage limitations, and source failures use the existing Academic result types without adding a tool schema or prompt section.

#### KV Cache effect

No direct prompt invalidation; the workflow owns serialization of retrieved evidence.

## Known Limitations and Deferred Work

- ACL supports site search; PMLR filters only configured volumes; CVF searches only configured conferences.
- New sites need working form selectors, paper-URL restrictions, PDF origins, and supported citation metadata. Supplying a homepage URL alone is insufficient.
- Login, CAPTCHA, paywalls, and access blocks are not bypassed. Markup changes require adapting the affected site configuration.
- PDF locations do not survive plugin unload or process restart. Re-search before resolving those records again.
- The adapter currently requires the Playwright MCP browser provider; other DSH browser providers are not interchangeable with its tool protocol.

### Dev Note

No separate invariant companion is maintained; provider validation and unload behavior are checked by owning tests.
