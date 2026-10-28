---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-21-academic-u0-events

English | [中文](2026-10-21-academic-u0-events.zh.md)

## Summary

Add Academic research event roots and two producer-owned message attribution kinds to the current upstream Session inventory without changing the writer format.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-21-academic-u0-events
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
    after: "a03f5ca83c004811503d0a61e35fe5824d2091b37fc1883f76e252581382df31"
    decision: same-version
  - root: "event:academic/candidate-screening-result"
    previous: null
    after: "dd1e128da0e39f8c530c5356bf0519d26657728bb2d418c737796b3d92fe7565"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-request-v1"
    previous: null
    after: "2391786e3d5ef2c89a2998080d879018deaf96fcfee577526c00832b169d5aed"
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
    after: "ded033bcfbe5054a0187dc69591534929b991620d71f4afb286eed80afd0ebb9"
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
    after: "99cb9ef72bd5c19ef55c9ff14410736c32f6b30447c07e1c018b595772152dcd"
    decision: same-version
  - root: "event:academic/synthesis-result"
    previous: null
    after: "65dfce48127f11027e535ba7455ab1961452d5398bdc6ea45b7a40141b0aa47d"
    decision: same-version
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-user-rpc-principal"
    after: "b18092704aaede28518f5c3bdba145ed115a03c6c131285a7357f065cf8c8470"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "838a68a91ec939c092b0f86ce5df29028bff1425c20342ba83833fea43f3b3ce"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "6da3041f23e0df4a26bda91a95823aaaaba17092cfeaeed10862651666d4d99f"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "631b46810f1a3aa947bebf067893433818583471cd05403701ec78047738ed51"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

This decision compares the current upstream writer with the same writer plus Academic producers. The nineteen Academic event roots are additions; existing upstream payloads and header fields are unchanged. They are present in the known-event table. An older reader that lacks a required event refuses that log before execution; this change does not mark required research records ignorable. The academic-workflow and academic-candidate-review sources contain only producer identity: complete instructions and request data remain in message content, and readers preserve that content without interpreting these kinds. Existing source variants remain available. The title-request event retains its complete messages and has no control branch on these producer kinds. The same-version decision covers this additive inventory transition, not runtime validation of importing the frozen T0 data. Native historical plan results without explicit approval metadata require fresh approval; no stored generation is rewritten.

<a id="verification"></a>
## Verification

Frozen dependency installation, the nine-step complete build including Host and Client aggregate typechecks, workspace constraints, source path checks, and full lint passed during integration. The package dependency policy passed for 85 packages. Source review confirms the known-event table and attribution-only fields. The persistence history verifier checks the generated acknowledgement and exact after schemas. Product startup, Session replay, real research and smoke tests are not executed in this round; historical-data and runtime acceptance remain separate.

<a id="dev-note"></a>
## Dev Note

None.
