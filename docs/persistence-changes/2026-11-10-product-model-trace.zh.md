---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-10-product-model-trace

[English](2026-11-10-product-model-trace.md) | 中文

## 概述

为五类已保存的产品模型请求事件增加可选追踪 ID，便于把请求与不含正文的传输诊断记录对应起来。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-product-model-trace
baseline: false
changes:
  - root: "event:product/claim-review-request-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "1b4178b82e387ab0e9d8b2fb19194979d6afbf230f7ab614cce23cb9ae37452a"
    decision: same-version
  - root: "event:product/cross-check-request-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "bc7a49642097e5741c45daf06e7e9dadeb98da20532c9f0eefc3ac2a3470dd12"
    decision: same-version
  - root: "event:product/model-request-v1"
    previous: "2026-11-10-product-trace-plan-identity"
    after: "94e30b84cc66bcaf802d3aa8f87356b015b37ad8e66e1421c273ac4dfe9bbff1"
    decision: same-version
  - root: "event:product/passage-model-request-v1"
    previous: "2026-11-10-product-passage-plan-identity"
    after: "799d94be90467dbda8296b2ea34380caa9e503e4b13157f061c9ef755dd61d48"
    decision: same-version
  - root: "event:product/synthesis-request-v1"
    previous: "2026-11-08-product-synthesis-transient-retry"
    after: "c40c93ecd5c5647bc162f7c1d5bd9bb870e4cc52f28118386cb05cbbe288b11a"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

各事件的追踪 ID 均为可选字段。缺少该字段的旧 Session 记录仍可读取，并沿用原有恢复身份。结果事件和必填字段均未变化。

<a id="verification"></a>
## 验证

持久化变更门禁核对生成的结构。产品工作流与对话投影单元测试覆盖新追踪 ID 和缺少该字段的旧请求；传输适配器单元测试核对请求头传递与诊断字段。

<a id="dev-note"></a>
## 开发备注

无。
