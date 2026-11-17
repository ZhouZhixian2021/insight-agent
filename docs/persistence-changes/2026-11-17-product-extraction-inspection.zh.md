---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-17-product-extraction-inspection

[English](2026-11-17-product-extraction-inspection.md) | 中文

## 概述

新增产品提取诊断事件，记录逐条校验、定向修复和相同正文复用。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-17-product-extraction-inspection
baseline: false
changes:
  - root: "event:product/extraction-inspection-v1"
    previous: null
    after: "a19e7b023b77a837b055c4da9f94a2c143b724c644750e31c38f41236b7c489c"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

仅新增诊断事件，原有请求、结果和证据事件版本不变。没有此事件的历史会话仍可读取，不将缺失记录解释为已完成逐条校验或复用。忽略该事件的读取端仍按原有证据和报告语义工作。

<a id="verification"></a>
## 验证

59 项定向工作流测试通过，覆盖短编号还原、修复失败保留有效条目和相同正文复用；工作流及界面模块类型检查通过。

<a id="dev-note"></a>
## 开发备注

无。
