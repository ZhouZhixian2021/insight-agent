---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-08-product-fragment-checkpoint

[English](2026-11-08-product-fragment-checkpoint.md) | 中文

## 概述

为产品调查检查点增加可选的页内片段游标。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-fragment-checkpoint
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "7283f744becf9d5abb73431e438001e03b5de6c28d6398707e0a0c939efd5a47"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

当前读取器将缺少 fragmentIndex 的旧检查点继续解释为已完成页面的游标，因此旧记录仍可续跑。新检查点在长页处理中保留原页面位置和正数 fragmentIndex。旧工作流恢复这种游标时会拒绝，而不会把未完成页面的证据当作完整结果；包含 maximumPageCharacters 的新计划也会被旧计划解析器拒绝，不会暗中扩大来源工作。

<a id="verification"></a>
## 验证

产品来源和工作流测试 27 项通过，覆盖长页偏移、片段检查点续跑及旧计划的 12000 字符上限。真实 Loader 产品调查测试使用两个长网页和四次提取请求，通过。

<a id="dev-note"></a>
## 开发备注

无。
