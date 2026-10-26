---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-23-academic-u0-port

[English](2026-10-23-academic-u0-port.md) | 中文

## 概述

将 Academic 研究 Session 事件与生产方归属信息迁入 U0 写入方，保持 Session header 版本不变。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

本次新增十九个 academic/* 事件类型，以及 academic-workflow、academic-research-controller 两个明确的 source kind，影响排队消息、user/developer 消息和已记录的标题模型请求。既有载荷分支、Session header 和事件信封均保持不变。没有 Academic 事件的旧日志仍按原含义读取。旧持久化读取方在读取或写入时遇到未知必读事件，会在暴露或追加历史前拒绝处理，不会把这些记录当作损坏尾部截断。user/developer 的 source kind 是归属元数据：即使未安装生产方，读取方也保留未知的非空 kind 及其 JSON 元数据，并派生相同消息内容。标题请求消息联合类型只增加相同的来源分支；该记录用于审计，不会派发或回放请求。明确的事件名与 source kind 标记可防止错误解释，因此保持相同版本。本决定不承诺降级支持，也不表示团队 T0 数据已经迁移到 U0。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/academic/workflow/tests/persistence-compatibility.spec.ts packages/session/session-persistence-jsonl/tests/native-source-admission.spec.ts packages/session/session-persistence-jsonl/tests/current-event-admission.spec.ts：40 项通过。检查覆盖已知及未知来源元数据与消息内容保留，并验证读写模式下未知必读事件的拒绝处理不会截断文件。B-U1/U2 后续开发记录中的学术定向回归命令另有 204 项通过，包含模型请求和结果的持久记录及后台运行行为。

<a id="dev-note"></a>
## 开发备注

无。
