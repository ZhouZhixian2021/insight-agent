---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-10-product-search-recognition

[English](2026-11-10-product-search-recognition.md) | 中文

## 概述

新增产品搜索识别请求与结果审计事件。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-product-search-recognition
baseline: false
changes:
  - root: "event:product/search-recognition-request-v1"
    previous: null
    after: "176465659bce9f931c8f9d7d18bbff7f004287807aacd522e7caf78ecdba7f35"
    decision: same-version
  - root: "event:product/search-recognition-result-v1"
    previous: null
    after: "b8d490dd3907278680fe8d068ff81cf228e64257f259c6b39f946432ecd6f733"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有事件结构不变。新事件保存实际模型输入输出供审计；没有此事件的旧会话仍有效，缺失不表示识别成功。恢复依赖已有发现阶段检查点，不依赖这些审计事件。

<a id="verification"></a>
## 验证

定向搜索恢复与工作流测试通过；正式装配浏览器验证记录在开发说明中。

<a id="dev-note"></a>
## 开发备注

无。
