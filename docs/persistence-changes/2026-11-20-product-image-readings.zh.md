---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-20-product-image-readings

[English](2026-11-20-product-image-readings.md) | 中文

## 概述

产品网页检查点可保存图片、图注和上下文。每条读图记录包含来源、模型以及读取结果或获取错误。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-20-product-image-readings
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-18-product-evidence-reading-context"
    after: "60433b9e635edc2b4ea867e4baaa04f8884c913d7b1f19d9702ad16e9e16c9e1"
    decision: same-version
  - root: "event:product/image-reading-v1"
    previous: null
    after: "963a0b8e5f9b87f1eace891fd46a8a674d372d0cd305c0607e8f53355d187c93"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

当前读取器可以从没有图片清单的旧检查点继续正文流程。新读图事件使用独立的类型标识，无法识别该标识的早期读取器会在回放前停止。原有网页快照与正文证据含义保持一致。

<a id="verification"></a>
## 验证

三个读图测试均通过，覆盖重复图片复用、恢复已保存结果、单图失败和取消。网页正文测试验证了保存的文本和文章图片上下文。

<a id="dev-note"></a>
## 开发备注

无。
