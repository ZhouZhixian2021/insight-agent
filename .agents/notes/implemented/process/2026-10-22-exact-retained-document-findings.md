# Agent Note: Exact retained document findings

Status: implemented

English | [中文](2026-10-22-exact-retained-document-findings.zh.md)

## Problem

The academic integration retains historical commit identities, frozen acceptance inputs, dependency pins, and model or user text. Rewriting those records to satisfy current documentation rules would change the evidence or behavior under review. Excluding their directories would also accept new violations.

## Decision

The repository-reference and concrete-term commands reconcile their complete raw detector results against [an explicit registry](../../../../scripts/retained-document-findings.json). Each entry identifies one file, detector, retention reason, finding kind, immediate-line-context SHA-256, and exact occurrence count. Historical records, dependency pins, and frozen samples also pin the complete LF-normalized file text. Checkout line-ending differences do not change these fingerprints; separate acceptance-material hashes retain byte-level verification.

Only exact registered findings are accepted. New paths, new contexts, changed multiplicities, changed pinned files, missing files, duplicate registrations, malformed entries, and unused entries fail the command. Registry failures remain failures even when no raw findings remain. Raw detector APIs retain their original results; neither command narrows discovery or skips a registered directory. The repository-reference command also recognizes registered commit prefixes when a checkout lacks their Git objects, but only after the pinned file and line-context hashes match; unregistered prefixes still require a matching local object. Removing a finding requires removing its stale registration in the same reviewed change. The registry has no refresh command.

This decision partially supersedes the [term ban](2026-08-26-ban-ambiguous-origin-label.md) for exact retained entries and the repository-reference check's unconditional rejection of historical identities. Both rules still apply to every unregistered occurrence. Registered visible text, frozen-field consumers, and model instructions remain behavior that requires separate review before alteration; an accepted registration establishes preservation, not runtime compatibility or report quality.

## Alternatives considered

**Rewrite all retained content.** Rejected because historical identities and frozen inputs must retain their meaning, and model or user text is outside this maintenance scope.

**Exclude whole directories or files from detection.** Rejected because later violations would pass without review. The complete raw scan and exact context counts continue to detect additions inside registered files.

**Automatically refresh a baseline.** Rejected because changed evidence or behavior could become accepted by rerunning a maintenance command. Registry edits require an explicit reviewed diff.

## Consequences

Documentation commands can pass with unchanged, explicitly retained findings. Their success means there are no unregistered findings or invalid registrations; it no longer means the raw detector returns no matches. Unrelated edits to pinned historical files also fail and require deliberate review. Context movement within an unpinned source file is accepted only when its neighboring lines and multiplicity remain identical.

The [focused tests](../../../../scripts/retained-document-findings.spec.ts) cover valid registrations and invalid changes, including both command entry points with isolated temporary repositories. They do not launch the product or replay research sessions.
