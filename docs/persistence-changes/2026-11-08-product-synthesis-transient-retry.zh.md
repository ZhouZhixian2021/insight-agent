---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-08-product-synthesis-transient-retry

[English](2026-11-08-product-synthesis-transient-retry.md) | 中文

## 概述

产品报告综合记录增加可选的尝试序号与分类失败码。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-synthesis-transient-retry
baseline: false
changes:
  - root: "event:product/synthesis-request-v1"
    previous: "2026-11-08-product-report-synthesis"
    after: "04f3a8e8970b9e26b4f65e9f4c8837abf501118e838d10a0178016b2171884d0"
    decision: same-version
  - root: "event:product/synthesis-result-v1"
    previous: "2026-11-08-product-report-synthesis"
    after: "e20c3c49dbdff4556fe3715039210c787844662a0218f7011a29d14b5f02960d"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有综合记录省略新字段。新版运行器仍按准确输入匹配旧请求并沿用其恢复规则。会话读取器接受并保留现有事件的新增字段。旧运行器仍可读取请求与结果，并应用原有恢复规则。

<a id="verification"></a>
## 验证

28 项工作流测试和 9 项产品洞察 Loader 测试通过。Loader 覆盖重读已记录的尝试、传输故障后重发相同输入、超时后的无效输出与超时共用重试额度，以及鉴权失败时停止。

<a id="dev-note"></a>
## 开发备注

无。
