# Agent Note: Academic Web reference identification

Status: implemented

English | [中文](2026-09-23-academic-web-reference-identification.zh.md)

## Problem

Web search results can contain paper identifiers beside unrelated or malformed text. Treating a matched string as a verified paper would admit unsupported metadata, while an empty list hides why a candidate was discarded.

## Decision

`identifyAcademicReferences()` reads one Web result's URL, title, and snippet without fetching. It recognizes explicit DOI and arXiv identifiers plus ACL, PMLR, and CVF official paper paths, including CVF workshop paths. It retains the discovery URL, deduplicates identifiers, preserves DOI spelling in `originalValue`, and lowercases its normalized DOI value.

The identifier returns A's `AcademicReferenceIdentificationResult`. A candidate with valid references keeps them beside identification issues; a discarded candidate has at least one issue. Multiple distinct DOI values without an exact DOI URL are ambiguous and are withheld. An exact DOI URL remains identifiable when surrounding text mentions another DOI. Only later provider verification can turn an identified reference into a scholarly work.

## Alternatives considered

Returning an empty array for every miss loses invalid and ambiguous reasons. Selecting the first of several DOI values can attach the wrong paper to a Web result. Fetching pages inside identification would mix reference parsing with source verification.

## Consequences

The pure identifier can be tested with fixed Web candidates and makes no network request. Its supported path patterns and ambiguity rules bound first-version coverage; unknown publishers and ambiguous identifiers remain visible as issues instead of becoming evidence.
