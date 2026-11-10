---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-10-product-trace-plan-identity

[English](2026-11-10-product-trace-plan-identity.md) | 中文

## 概述

为产品提取请求、提取结果及综合结果事件增加可选计划身份，供逐任务 Trace 展示。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-product-trace-plan-identity
baseline: false
changes:
  - root: "event:product/model-request-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "bcf869589e89ec446564e88c2b765421feb69806b45ec150fda2ac4b1e6895b0"
    decision: same-version
  - root: "event:product/model-result-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "6ebd95ad6dad8e98b2d5cbf4d0ac1dbb3d91d0489e726cbf0172b48ce3478897"
    decision: same-version
  - root: "event:product/synthesis-result-v1"
    previous: "2026-11-08-product-synthesis-transient-retry"
    after: "0c65255ee490475f77062dcc6b36e8e890f45b0a4451f72ddacb49fbe93eb7ef"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

缺少 planId 的历史记录仍可读取；新写入方从获批计划或候选记录提供身份，页面不推测旧未关联事件的计划。不改变事件名称和必填字段；历史显式计划额度与保存的原文偏移仍有效。

<a id="verification"></a>
## 验证

产品工作流、来源准备与筛选、写作及聊天定向测试共 73 项通过；未调用真实模型。

<a id="dev-note"></a>
## 开发备注

无。
