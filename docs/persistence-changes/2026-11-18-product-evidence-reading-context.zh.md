---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-18-product-evidence-reading-context

[English](2026-11-18-product-evidence-reading-context.md) | 中文

## 概述

产品证据可以保存归因和测量条件的原文片段。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-18-product-evidence-reading-context
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-ranked-fragments"
    after: "bbb9652a5a15177701e6a078bf34349fa8e6244ec333d40844943dbcbacebf24"
    decision: same-version
  - root: "event:product/evidence-v1"
    previous: "2026-11-08-product-pdf-page"
    after: "cc1e39a583621bf982be420efa111451f98e1c0d62169ea528ae51b6d2ee419a"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

逐条阅读信息为可选字段。历史记录缺失时归因记为未知，沿用证据编号、摘录和定位。

<a id="verification"></a>
## 验证

回放并核对 163 条历史综合材料的陈述、摘录和引用别名。定向测试验证无法定位的附加信息会被丢弃，有效证据仍然保留。

<a id="dev-note"></a>
## 开发备注

无。
