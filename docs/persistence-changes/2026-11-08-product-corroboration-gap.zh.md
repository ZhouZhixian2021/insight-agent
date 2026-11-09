---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-08-product-corroboration-gap

[English](2026-11-08-product-corroboration-gap.md) | 中文

## 概述

处理新增佐证网页期间，检查点可保留上一轮已经完成的比对。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-corroboration-gap
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-gap-reread"
    after: "0ba487078904dd14736d4feb60a6278629390bc4814921e660ab3172b7a13f66"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

旧检查点省略 priorVerifications，沿用原有阶段语义。会话解码器在现有事件中保留这个可选字段。旧运行器会在校验游标时拒绝包含既有审核的佐证提取检查点。新版运行器校验所保留的比对身份，并在来源复核重置证据时清除这些比对。

<a id="verification"></a>
## 验证

产品洞察的 47 项定向测试通过，覆盖新增佐证网页后的续跑和共享额度用尽。Loader 用例重新打开会话，验证限定获批域名的补查可以形成正式报告，且审核和比对调用只处理新增证据。

<a id="dev-note"></a>
## 开发备注

无。
