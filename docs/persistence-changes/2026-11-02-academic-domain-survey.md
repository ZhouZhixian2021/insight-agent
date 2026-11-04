---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-02-academic-domain-survey

English | [中文](2026-11-02-academic-domain-survey.zh.md)

## Summary

Records approved domain-survey model calls and completed direction maps, and permits a survey-bound domain plan in synthesis requests.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-02-academic-domain-survey
baseline: false
changes:
  - root: "event:academic/candidate-screening-request"
    previous: "2026-10-29-academic-scope-screening"
    after: "dab1765e3327dd89ee2a64eac4248e1e125ec28424abc2846959a654d19a6762"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-request-v1"
    previous: "2026-10-29-academic-scope-screening"
    after: "a28278548a14671fa3d223867de847e98f52899f5c772052fb2c742831c96800"
    decision: same-version
  - root: "event:academic/coverage-request-v1"
    previous: "2026-11-02-academic-coverage-merge"
    after: "3ae23b584260e1b3b132e4824b331c2fe2bef3a19adb64ee9153f2d3864b4562"
    decision: same-version
  - root: "event:academic/coverage-review-request-v1"
    previous: "2026-10-30-academic-aspect-coverage"
    after: "a5eaa9158f8a7953f52b2bec80a008b6221213afbe79cce00dc05d52255f801f"
    decision: same-version
  - root: "event:academic/domain-survey-completed-v1"
    previous: null
    after: "e6b4ce1fe3b88d698434b31f2e0aded5ca4f6e1bf603361e49d6facd833338e1"
    decision: same-version
  - root: "event:academic/domain-survey-request-v1"
    previous: null
    after: "cf714411430d8746afaf9d891e736638aac3c4ec579190e5b4b3dc411cf4c0ec"
    decision: same-version
  - root: "event:academic/domain-survey-result-v1"
    previous: null
    after: "3dc32a8a48f68a90a6edfbbb8c3e42b57ae8dcd4b4f8a3acb4cf8d9be645f5a7"
    decision: same-version
  - root: "event:academic/evidence-request"
    previous: "2026-10-29-academic-scope-screening"
    after: "d7f9a64a013427ce2f0c110b99ea00f92e52eb853d0edd4b7e4fca617018be1f"
    decision: same-version
  - root: "event:academic/synthesis-request"
    previous: "2026-11-02-academic-scope-decision"
    after: "c5f47125418488b12ed64e886d9aa5b9673328c3dfd68562d642566683a5ff92"
    decision: same-version
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-21-academic-u0-events"
    after: "e49d2a8de482e197b3a73d14e7376405982fca88a5e4c43920dfbcd10f86b84e"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-21-academic-u0-events"
    after: "41e7da4fd0755d0bd0a2c68a6b4eae8557a46ee4438b915b358abdbe3716ca41"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-21-academic-u0-events"
    after: "13e22314f970f2279e05a20f5d75fb00349622b004d3ce09a7a0c63136dfa5e3"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-21-academic-u0-events"
    after: "48368d3ca48a2eb46a9cd2e1dd089cc92ca15a24e6f72d5a592ad20c981e473d"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The three survey event tags are new and required. Readers that do not know them reject affected Sessions rather than silently dropping the approved map. Existing Session events remain valid: the new model message source is an additive attribution kind, and domainResearchPlan is optional in synthesis input. The academic projection state version advances to 4 so saved older checkpoints are folded again from the journal. The Session writer format remains 4; old records are not rewritten.

<a id="verification"></a>
## Verification

Targeted Academic Controller, retrieval, report, and client tests passed. TypeScript builds passed for the touched packages. The persistence checker identified three new roots and additive optional or attribution changes before this record. No live provider survey or historical Session corpus was exercised.

<a id="dev-note"></a>
## Dev Note

None.
