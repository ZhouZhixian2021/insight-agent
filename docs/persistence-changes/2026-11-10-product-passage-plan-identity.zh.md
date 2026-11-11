---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-10-product-passage-plan-identity

[English](2026-11-10-product-passage-plan-identity.md) | 中文

## 概述

为保存的网页正文和原文位置选择模型事件增加可选的获批计划身份，使对话 Trace 能将新记录关联到对应调查。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-product-passage-plan-identity
baseline: false
changes:
  - root: "event:product/passage-model-request-v1"
    previous: "2026-11-10-product-passage-evidence"
    after: "92bf64320b04c6b45970e8224a7b677814be043e6ca1acfcab94df1ae3f43187"
    decision: same-version
  - root: "event:product/passage-model-result-v1"
    previous: "2026-11-10-product-passage-evidence"
    after: "600c6144ce369beaa29b3691824862a786919a1a95a7c494da99332a74b01e1f"
    decision: same-version
  - root: "event:product/source-text-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "c2df876a58b87fbc381bfa9d19e8386fe12ae9fb5b4aef8e3c3e17e7ae484815"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

这些字段保持可选，以兼容缺少计划身份的旧记录。正文和原文位置选择的恢复仍可按候选网页身份读取旧记录；Trace 只投影明确带有获批计划身份的事件。事件名称和必填字段不变，因此旧 Session 文件仍可读取。

<a id="verification"></a>
## 验证

`pnpm run verify-persistence-changes` 核对生成的结构并确认这些可选字段。产品洞察单元测试覆盖证据保存、检查点恢复和对话投影；本记录不要求冒烟测试。

<a id="dev-note"></a>
## 开发备注

无。
