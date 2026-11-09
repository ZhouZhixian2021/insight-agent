---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-08-product-fragment-overlap

[English](2026-11-08-product-fragment-overlap.md) | 中文

## 概述

在完整的产品调查恢复检查点中记录片段窗口的划分方式。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-fragment-overlap
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-fragment-checkpoint"
    after: "03acaf0a1ef2f0c5c69d7fae2e09cad0ecf6e4abb2454488ead8548be6714aaa"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

当前读取器以连续片段恢复已有的版本 1 检查点，仅在固定重叠为 1,499 字符时恢复版本 2 检查点；版本 2 的重叠值缺失或不匹配会被拒绝。旧读取器只接受 schemaVersion 1，因此在模型工作前拒绝版本 2 检查点，不会按不同偏移悄然续跑。事件名称仍为 product/checkpoint-v1，会话格式版本不变。

<a id="verification"></a>
## 验证

产品来源和工作流测试 29 项通过，覆盖跨边界摘录、去重、版本 1 续跑、版本 2 恢复及重叠值不一致时拒绝。产品包 TypeScript 构建和定向 lint 通过。

<a id="dev-note"></a>
## 开发备注

无。
