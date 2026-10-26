---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-23-academic-u0-port

English | [中文](2026-10-23-academic-u0-port.zh.md)

## Summary

Ports the Academic research Session events and producer attribution into the U0 writer without changing the Session header version.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-23-academic-u0-port
baseline: false
changes:
  - root: "event:academic/background-run-state"
    previous: null
    after: "11da5f373e5de878797edcf915de0decc322a1cfeab6665867e21a45e101ee58"
    decision: same-version
  - root: "event:academic/candidate-batch-decision"
    previous: null
    after: "f68426d9cee9399d34d0b6ab6f59cc2115666e1b04fafa66c698dfb2aab10e0f"
    decision: same-version
  - root: "event:academic/candidate-batch-settlement"
    previous: null
    after: "4ae34045ce25370b647535c5788f2905a33750bf8f9ca4be0cd5ce4ea1f963e6"
    decision: same-version
  - root: "event:academic/candidate-review-selection-v1"
    previous: null
    after: "491991231008d253dc913ab0e95b94443cef9a5280468b65ad4acde0f42a6517"
    decision: same-version
  - root: "event:academic/candidate-screening-request"
    previous: null
    after: "2c75fd383c5e71f1b6462059962db143cea833e740ac00a34ecee5e2ad1a6bc2"
    decision: same-version
  - root: "event:academic/candidate-screening-result"
    previous: null
    after: "dd1e128da0e39f8c530c5356bf0519d26657728bb2d418c737796b3d92fe7565"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-request-v1"
    previous: null
    after: "0fe037aff8b93e3dc47d32a335d3a63c6a89773b3132420bd6064a72329211b3"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-result-v1"
    previous: null
    after: "4daf11cbd360a34b527c2ac927e07a0fc5d3c2a901bcf80cc5a1a4601cded0b6"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-verified-v1"
    previous: null
    after: "88cb402587c5ba748577ef74b39ed4eefc8c0ccaed93beb1c4796d3d3219df89"
    decision: same-version
  - root: "event:academic/evidence-enhancement-selection"
    previous: null
    after: "4ef74c5ee6f658ea40f4ea4c20ef75786f322e39444edb11f5646920d8b56be1"
    decision: same-version
  - root: "event:academic/evidence-enhancement-settlement"
    previous: null
    after: "debee0c625cbe200eb16a27afccac661c4d7b5f9052eac14714e106a53565e22"
    decision: same-version
  - root: "event:academic/evidence-fragment-verified"
    previous: null
    after: "a47ae68f141099d966b3cf08323115ddebbb12f7e073dece40583cd49867cb49"
    decision: same-version
  - root: "event:academic/evidence-request"
    previous: null
    after: "95b41961f6e4a47fb6370db4f6e840c3530674643d6169eb3cb9b257e538d5e8"
    decision: same-version
  - root: "event:academic/evidence-result"
    previous: null
    after: "69641359624112a870ae02301058530e7b59633e40b85b726479382acdc46cb2"
    decision: same-version
  - root: "event:academic/recovery-checkpoint"
    previous: null
    after: "fe458f4aca99770f8568aa3f1e8f20f9ff9fa950ae117bfb5f0151e81c1c46b1"
    decision: same-version
  - root: "event:academic/run-settlement"
    previous: null
    after: "493360932ac0bfdea05551251663203b71654723faca3a179dff8c53a4194d3b"
    decision: same-version
  - root: "event:academic/search-plan"
    previous: null
    after: "1e8c7c9fdd1265e5df3415f8eeeefa2e574613a2a1f8162dafa5444dab4be362"
    decision: same-version
  - root: "event:academic/synthesis-request"
    previous: null
    after: "0296b8a33df9553335cfc05e3d95d27f81a991d8a53d295171e67b36770aeac6"
    decision: same-version
  - root: "event:academic/synthesis-result"
    previous: null
    after: "65dfce48127f11027e535ba7455ab1961452d5398bdc6ea45b7a40141b0aa47d"
    decision: same-version
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-user-rpc-principal"
    after: "b818e8573022a2887c775c868d179cfb4baa2223c4589c9f54c294dfbe9d8314"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "eb5eaeee887844737f4100ae070956c5b3043c5883ee190fe1ade0c071f9dd3f"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "4b3e044d425bc26236eac6c2ef0bf963583006c9525c60d7890f4d395f7de035"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "390230997671c74315439cbe64fb6fccd8fc3966d4a42e9c8b7476afca57fa86"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The change adds nineteen academic/* event types and two explicit source kinds, academic-workflow and academic-research-controller, to queued, user and developer messages and recorded title-model requests. Existing payload alternatives, Session headers and event envelopes remain unchanged. New readers retain the meaning of existing logs when Academic events are absent. Older persistence readers refuse unknown required event types on read or write before exposing or appending history, and do not truncate those records as corruption. User and developer source kinds are attribution metadata: readers preserve an unfamiliar nonempty kind and its JSON metadata without the producer installed, while deriving the same message content. The title-request message union gains those same source alternatives; it is an audit record and does not dispatch or replay requests. The explicit event names and source kind tags prevent reinterpretation, so the transition remains same-version. This decision does not promise downgrade support or migration of team T0 data into U0.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/academic/workflow/tests/persistence-compatibility.spec.ts packages/session/session-persistence-jsonl/tests/native-source-admission.spec.ts packages/session/session-persistence-jsonl/tests/current-event-admission.spec.ts: 40 tests passed. These checks preserve known and unfamiliar source metadata and message content, and verify unknown required-event refusal without file truncation in read and write modes. The focused Academic regression command recorded in the B-U1/U2 follow-up development record passed 204 tests, including durable model request/result recording and background-run behavior.

<a id="dev-note"></a>
## Dev Note

None.
