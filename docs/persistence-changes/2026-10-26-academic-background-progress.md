---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-26-academic-background-progress

English | [中文](2026-10-26-academic-background-progress.zh.md)

## Summary

Adds required compact background progress and candidate-preserving Q6 metadata events while keeping complete background checkpoints unchanged.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-26-academic-background-progress
baseline: false
changes:
  - root: "event:academic/background-run-progress"
    previous: null
    after: "9284abbbf19e64169ff34e4ff19520423a0d61e5fa9f02b3c1b7f660f7434b9a"
    decision: same-version
  - root: "event:academic/background-run-q6-update"
    previous: null
    after: "a81b174749513e6b65d02ba22aea76dece987e7828503eff76c14537f1315d50"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The Session writer format stays at version 4. Current readers preserve legacy full-state semantics and fold mixed histories only against matching Session, background-run, Brief, retrieval-run and Q6 version identities. Both new event types are required-on-read and are never marked ignorable. A prior event vocabulary refuses them; a reader that supports pure progress but lacks the Q6 metadata tag also refuses that tag rather than discarding candidate-dependent metadata. Projection cache state version 3 forces older cached states to refold. Slow live subscribers receive the latest pending view and terminal state; all committed durable progress remains available. Existing files and frozen predecessors are not rewritten. Large pre-existing history reopening and sustained real research memory are not certified by the offline checks.

<a id="verification"></a>
## Verification

Three owner test files: 126 tests passed. Two external regression files: 5 tests passed, including real runResearchDraft to Session candidate-duplication budgets, every tested progress prefix restoration, slow-subscriber coalescing/abort cleanup, and released-V4 vocabulary rejection with unchanged input objects. Targeted type-aware lint: six files, 90 rules, zero diagnostics. Official complete build: nine gates passed, including artifacts and both aggregate type checks. Original V2/V4, T0 and historical failure artifacts are protected separately; no product, ACP, SDK replay or smoke was started.

<a id="dev-note"></a>
## Dev Note

None.
