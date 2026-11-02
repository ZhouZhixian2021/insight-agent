---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-02-academic-coverage-merge

English | [中文](2026-11-02-academic-coverage-merge.zh.md)

## Summary

Integrates question completeness assessment with the existing aspect coverage types. Coverage request input may include optional question aspect assessments and an optional assessment basis.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-02-academic-coverage-merge
baseline: false
changes:
  - root: "event:academic/coverage-request-v1"
    previous: "2026-10-30-academic-question-coverage"
    after: "12750c1f4f111d7aa11b6003025dd7034925e84ca571ed3b65d05b3dc702cb48"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing coverage requests remain valid because both fields are optional. The question completeness parser reads approved questions and evidence references and does not require these fields. Aspect-enabled runs retain their bounded reviewer and do not dispatch the additional question completeness assessment. Existing event names and the Session format version remain unchanged.

<a id="verification"></a>
## Verification

Focused academic workflow, retrieval, evidence, report, source, controller and scanner tests passed (1150 tests). The merged coverage scheduling and changed report UI tests passed (114 tests), including assertions that aspect review does not dispatch a second question assessment.

<a id="dev-note"></a>
## Dev Note

None.
