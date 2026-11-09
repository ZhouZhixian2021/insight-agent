---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-08-product-report-synthesis

[English](2026-11-08-product-report-synthesis.md) | 中文

## 概述

记录产品报告综合生成的每次请求与有界响应，包括失败尝试和完整重生成。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-report-synthesis
baseline: false
changes:
  - root: "event:product/synthesis-request-v1"
    previous: null
    after: "447f8905f4ba2d1d98bde5471a2a0de9dd5a98465ecb06dceebcf9f4c19ae2b8"
    decision: same-version
  - root: "event:product/synthesis-result-v1"
    previous: null
    after: "55704245f3bd44251214699cd17c5d7dc1ff9a02a5757015fea967fe895f516a"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

读取器仍能读取已有记录和检查点。新增必需事件名称区分综合生成、证据提取和来源比对。未登记新名称的读取器在解释或恢复日志内容前拒绝含这些事件的日志。

<a id="verification"></a>
## 验证

产品洞察 Loader 的四项测试通过，覆盖重新打开已保存会话、校验无效输出和重生成响应的序号关联，以及交付正式报告和带引用草稿。使用上一版事件目录的构建在读取时拒绝了新增必需事件。

<a id="dev-note"></a>
## 开发备注

无。
