---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-08-product-pdf-page

[English](2026-11-08-product-pdf-page.md) | 中文

## 概述

记录产品证据文本范围中的 PDF 物理页码。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-pdf-page
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-corroboration-gap"
    after: "c4da7c56525e44765a28cd8fd03112b37eb8b999afa5884a36d38761754154a3"
    decision: same-version
  - root: "event:product/evidence-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "797feb241fff6f45b0905dc6b99439a03c70b2017351942d3bf16a0a25e876fe"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

可选字段 pdfPage 扩展了文本范围位置，并保留准确的起止偏移和规范化正文校验值。旧有 HTML 和文本证据没有页码，仍可读取。旧版读取器可以核验保存正文中的偏移。它可能拒绝带有保留审核的部分复核检查点，因为此前只在追加佐证时允许这种恢复状态。

<a id="verification"></a>
## 验证

产品来源和工作流测试核验了 PDF 物理页码、跨页摘录的拒绝行为，以及对未变更来源证据和审核的保留。

<a id="dev-note"></a>
## 开发备注

无。
