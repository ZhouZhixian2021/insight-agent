---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-30-academic-targeted-coverage

English | [中文](2026-10-30-academic-targeted-coverage.zh.md)

## Summary

Adds schema-2 targeted coverage repair state, frozen source/token/time/candidate limits, dispatch reservations, evidence digests and optional repair routing.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-academic-targeted-coverage
baseline: false
changes:
  - root: "event:academic/coverage-repair-state-v1"
    previous: "2026-10-30-academic-aspect-coverage"
    after: "54d1979b7c482ad5bcb68a76a1e5d53f4039758ed1a4fcd1788fbdf4bdb450f8"
    decision: same-version
  - root: "event:academic/recovery-checkpoint"
    previous: "2026-10-30-academic-aspect-coverage"
    after: "ea62d2cb17ca9804ad7adf7e54170d86a59da1b48ec6e224b34925bb0fa52347"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Session header remains version 4. The required coverage event carries repair-state schemaVersion 2 for targeted policies. Historical readers validate schemaVersion 1 and refuse schema-2 executable recovery rather than resetting budgets. Current readers accept historical schema-1 state only without targeting, preserving its original frozen policy. Optional review routing and gap terms are validated at the model boundary; missing historical fields do not authorize new work. Dispatch reservations persist before model calls; recovery rejects rollback of characters, candidate reads, timestamps and settled or interrupted reservations.

<a id="verification"></a>
## Verification

27 focused coverage, targeting and recovery tests passed, including schema-1 refusal for targeted state and interruption/rollback checks. A real Loader targeted-coverage fixture passed and was captured for keyless replay. Legacy coverage behavior remains covered by its existing fixture.

<a id="dev-note"></a>
## Dev Note

None.
