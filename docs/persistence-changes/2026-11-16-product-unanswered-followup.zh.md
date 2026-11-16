---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-16-product-unanswered-followup

[English](2026-11-16-product-unanswered-followup.md) | 中文

## 概述

在产品调查结算时记录未回答问题，供用户选择后续调查。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-16-product-unanswered-followup
baseline: false
changes:
  - root: "event:product/run-settlement-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "2befc74bb11f85062aea038c98a163849e829a752dbeb7b06408f6fc1ed2ce7d"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

字段为可选。旧结算仍可读取并展示原报告，不显示追问入口。新读取器会校验可选列表后再展示；旧读取器忽略新增字段。

<a id="verification"></a>
## 验证

产品工作流和对话卡聚焦测试通过；新列表从已结算结果投影，不更改获批计划或报告。

<a id="dev-note"></a>
## 开发备注

无。
