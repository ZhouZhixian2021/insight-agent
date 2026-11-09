---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-08-product-ranked-fragments

[English](2026-11-08-product-ranked-fragments.md) | 中文

## 概述

记录产品取证中未完成网页的片段派发顺序。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-ranked-fragments
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-pdf-page"
    after: "2a75e5e4df5f543b6eda9fc42e9e6005deeccd089c2aefb80ef411c09647087b"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

版本 3 检查点在网页未完成时记录已排序片段的规范化正文起始偏移，游标按该顺序计数。当前读取器按原文顺序和原有布局续跑版本 1 和 2。旧版读取器在派发前拒绝版本 3，因为其游标使用原文顺序。会话事件名称和格式版本继续有效。

<a id="verification"></a>
## 验证

产品来源和工作流测试核验了获批问题之间的排序、原文偏移与摘录额度、非法顺序的拒绝，以及排序游标和旧游标的续跑。

<a id="dev-note"></a>
## 开发备注

无。
