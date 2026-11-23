---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-23-product-page-summary-review

[English](2026-11-23-product-page-summary-review.md) | 中文

## 概述

新产品调查保存逐篇提要及全文审核的模型请求和配对结果。第 4 版检查点按网页快照保存已审核段落。综合模型采用线路默认输出额度时，请求记录可省略 maxTokens。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-23-product-page-summary-review
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-20-product-image-readings"
    after: "5376920d06b40dd51add940c71a41cc114d7c55993fcfc7cba111ea78900f78e"
    decision: same-version
  - root: "event:product/page-summary-request-v1"
    previous: null
    after: "4f4fc5d0af48103e483d9fe9c3a8544251bc386fd37e300b71e69c93946f4091"
    decision: same-version
  - root: "event:product/page-summary-result-v1"
    previous: null
    after: "27173cd185723a4e598b089503fe37c18931dd521f80273111510e263b061c7c"
    decision: same-version
  - root: "event:product/synthesis-request-v1"
    previous: "2026-11-08-product-synthesis-transient-retry"
    after: "3033c6a130b46f2b256f0fe5fa0ed997bb8f97d74985a964c2c2c476c0545954"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新读取方沿用原来的摘录流程恢复第 1 至 3 版检查点，对第 4 版使用全文审核。复用结果时匹配网页、快照摘要值、模型、输入和请求序号。旧读取方会拒绝新增的必需会话事件或在恢复时拒绝第 4 版检查点。历史综合请求中记录的额度含义不变，字段缺失代表使用线路默认值。

<a id="verification"></a>
## 验证

investigation.spec.ts 和 extraction-model.spec.ts 中的三项定向 Vitest 用例通过，覆盖审核提要生成正式报告、跨段引用、保留正确段落、拒收漏审和无原文依据的修订、检查点恢复、三页并行与会话请求结果配对回放。

<a id="dev-note"></a>
## 开发备注

无。
