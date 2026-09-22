# Agent Note: Academic hybrid retrieval separates discovery from verification

Status: implemented

English | [中文](2026-09-22-academic-hybrid-retrieval-contract.zh.md)

## Problem

The Academic workflow has a provider-neutral multi-source search path, but adding general Web search creates a different trust boundary. A Web result can point to a paper without proving its identity, metadata, version, or full text. B needs stable reference-identification and verification inputs, while C needs browser-safe stages and counts before either implementation can proceed without inventing overlapping fields.

## Decision

The shared contract distinguishes the `academic` and `web_discovery` channels. An optional per-search retrieval policy lists direct Academic providers separately from reference-verification providers and carries independent Web-discovery and reference-verification bounds. It is optional so current schema-version-2 plans keep their existing behavior; absence means no approved hybrid policy, not zero observed activity.

Web discovery produces `AcademicWebDiscoveryCandidate` values. A pure identifier converts them into DOI, arXiv, or namespaced ACL/PMLR/CVF provider-record references while retaining the original discovery URL. Identification performs no network trust decision. Providers may implement `verifyReference()` to resolve one supported reference to an existing `AcademicSourceWork`; an authoritative miss returns `null`, while transport or parsing failures reject for later classified settlement. The public outcome vocabulary preserves verified work/full-text data or a credential-free per-reference failure. Web titles, snippets, and generated answers never become evidence.

The optional `hybridRetrieval` Remote projection carries producer-settled Academic search, Web discovery, reference identification, reference verification, and deduplication stages. It keeps direct records, Web URLs, references, verification attempts, successful and failed verification, discarded references, merged duplicates, and deduplicated works as distinct counts. Each browser-safe reference retains its kind, normalized value, discovery URL, verification provider, status, and sanitized message.

The fixed synthetic fixture covers DOI, arXiv, ACL, PMLR, and CVF references, including official records without DOI or arXiv identifiers. It also fixes one verified result, one classified failure, and the browser projection. The current runtime does not populate the optional fields or execute Web discovery; later plan and workflow increments consume this contract.

## Alternatives considered

**Treat every Web result as a paper.** Rejected because a search snippet does not establish a scholarly identity or evidence provenance.

**Support only DOI and arXiv references.** Rejected because valid ACL, PMLR, and CVF official records do not always expose either identifier.

**Use arbitrary URLs as global work identities.** Rejected because equivalent URLs vary and provider-local record ids require namespaces; cross-provider merging still needs verified identifiers or correspondence.

**Make hybrid fields required immediately.** Rejected because existing approved plans and Remote consumers are single-channel. Optional fields allow B and C to build against the fixed contract while A adds plan validation and execution in later increments.

## Consequences

B can implement reference parsing and authoritative provider lookup without modifying workflow or client types. C can build deterministic no-network views from the fixture without inferring stages from aggregate counts. A retains ownership of plan validation, orchestration, settlement, and Remote population.

Exact verified DOI or arXiv identifiers and same-provider record ids can support deduplication. Title, author, year, or ordinary discovery-URL similarity remains an audit candidate rather than an automatic merge. The interface baseline alone does not claim that hybrid retrieval works in production.
