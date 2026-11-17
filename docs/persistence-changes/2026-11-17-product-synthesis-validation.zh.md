---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-17-product-synthesis-validation

[English](2026-11-17-product-synthesis-validation.md) | 中文

## 概述

为 product/synthesis-result-v1 增加可选的逐题输出校验诊断。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-17-product-synthesis-validation
baseline: false
changes:
  - root: "event:product/synthesis-result-v1"
    previous: "2026-11-10-product-trace-plan-identity"
    after: "d92378b6c87400247b6e674bfe00d3d6cffbbe2474e2f702bc4f28d15cebfa6c"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

历史结果没有 validation 仍可读取；恢复时结合对应请求材料重新检查原始输出。新诊断仅描述已通过问题编号、校验问题和自动整理说明。已有读取方忽略附加字段，继续使用原始文本、错误状态和 requestSeq；缺失诊断不代表校验通过。未改变 Session 版本或已有必填字段。

<a id="verification"></a>
## 验证

76 项工作流及产品聊天定向测试通过，涵盖部分输出保留、逐题修复、请求重试、取消、渲染及缺少诊断的历史 Trace 事件。

<a id="dev-note"></a>
## 开发备注

无。
