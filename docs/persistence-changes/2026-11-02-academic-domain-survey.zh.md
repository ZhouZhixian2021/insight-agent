---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-02-academic-domain-survey

[English](2026-11-02-academic-domain-survey.md) | 中文

## 概述

记录获批领域勘察的模型调用、完成的方向图谱，并允许合成请求携带绑定勘察的领域计划。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

三个领域勘察事件标签为新增必读类型。旧读取器不认识这些标签时会拒绝相关会话，不会悄悄丢失已审核图谱。既有会话事件仍有效：模型消息来源只新增归因类型，合成输入中的 domainResearchPlan 为可选字段。学术投影缓存状态版本升至 4，使旧检查点从日志重新折叠。Session 写入格式仍为 4，旧记录不改写。

<a id="verification"></a>
## 验证

已运行 Academic Controller、检索、报告及客户端的针对性测试，相关包的 TypeScript 构建通过。记录前持久化检查识别出三个新根，以及可选字段或来源归因的增量变化。尚未执行真实提供方勘察或大规模历史会话重开验证。

<a id="dev-note"></a>
## 开发备注

无。
