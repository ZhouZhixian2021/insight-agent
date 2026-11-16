---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-16-product-review-request-pairing

[English](2026-11-16-product-review-request-pairing.md) | 中文

## 概述

为并发产品原文审核结果记录准确的请求序号。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-16-product-review-request-pairing
baseline: false
changes:
  - root: "event:product/claim-review-result-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "45fb4bcb0f6900d00c6da947c126aef777bb2d6fb00da465514bb4f3388f4825"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

向 product/claim-review-result-v1 增加可选 requestSeq。历史缺少此字段的记录仍可读取；新的纯原文审核提示不会复用旧的问题相关性审核响应。新恢复逻辑要求准确序号关联，不猜测并发完成顺序。旧结构读取器忽略可选字段，但旧工作流不支持恢复乱序完成的审核检查点，应使用更新后的工作流恢复。审核 questionIds 结构保留且允许为空；提取阶段问题编号仅作发现线索。

<a id="verification"></a>
## 验证

60 项工作流、写作和客户端定向测试通过，覆盖空审核问题编号、24条与3并发调度、乱序检查点恢复及 Trace 配对。完整构建9项检查通过。

<a id="dev-note"></a>
## 开发备注

无。
