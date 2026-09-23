# Agent Note: Academic single-reference verification

Status: implemented

English | [中文](2026-09-23-academic-single-reference-verification.zh.md)

## Problem

A Web result can identify a plausible paper URL or identifier without proving that the paper exists or that its title, authors, version, and full-text location belong to it. Scanning complete ACL, PMLR, or CVF catalogs to check one candidate also adds avoidable requests and latency.

## Decision

`AcademicSourceRuntime.verifyReference()` checks the caller's provider allowlist before routing one DOI to OpenAlex, arXiv ID to arXiv, or namespaced official record to ACL, PMLR, or CVF. A registered provider can verify a single record even when its catalog search has no configured pages. Missing registration is a configuration error; a missing or mismatched official record produces a per-reference failure.

arXiv uses `id_list` and matches an explicitly requested version. OpenAlex reads its DOI singleton and compares the returned DOI. ACL, PMLR, and CVF fetch only the paper's official page, parse citation metadata, and check its official record or PDF URL. PMLR retains the page's PDF URL in a bounded instance cache because an official paper can publish a PDF outside the derived path. The result carries a normalized work and full-text candidates, not downloaded or extracted body text.

## Alternatives considered

Accepting a plausible URL or a successful HTTP response alone does not validate paper metadata. Re-searching a full catalog for each Web result increases work and can miss papers outside the configured catalog subset. Using the derived PMLR PDF path after reading the paper page can point to a nonexistent file.

## Consequences

The five providers can settle one identified reference without expanding its citation network. Official record absence, transport errors, rate limits, and parse failures remain distinct; caller cancellation aborts the call. Full-text safety, download limits, parsing, and evidence creation remain with the downstream fetch and evidence packages.
