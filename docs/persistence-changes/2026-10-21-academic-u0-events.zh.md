---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-21-academic-u0-events

[English](2026-10-21-academic-u0-events.md) | 中文

## 概述

在当前上游 Session 类型清单中增加学术研究事件根和两种生产者消息归属类型，不改变写入格式。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

本决定比较当前上游写入器与加入学术生产者后的同一写入器。十九个学术事件根为新增，上游既有载荷和头字段保持不变，新增事件已列入已知事件表。缺少必需事件的旧读取器会在执行前拒绝该日志；本次不将必需研究记录标为可忽略。academic-workflow 和 academic-candidate-review 来源仅承载生产者身份，完整指令与请求数据仍在消息内容中，读取器无需解释这些类型即可保留内容。既有来源变体继续可用。标题请求事件保留完整消息，不根据这些生产者类型执行控制分支。保持同版本的决定仅覆盖这一新增类型清单转换，不代表冻结 T0 数据导入已通过运行验证。缺少明确批准元数据的历史原生计划结果需要重新批准，不重写任何已存储代际。

<a id="verification"></a>
## 验证

集成期间，冻结依赖安装、包含 Host 和 Client 聚合类型检查的九步完整构建、工作区约束、源码路径检查和完整 lint 均通过。包依赖策略检查覆盖的 85 个包通过。源码审查确认已知事件表和仅作归属的字段；持久化历史校验器核对生成的确认记录和精确的变更后 schema。本轮不启动产品、不进行 Session 回放、真实研究或冒烟测试；历史数据和运行时验收单独保留。

<a id="dev-note"></a>
## 开发备注

无。
