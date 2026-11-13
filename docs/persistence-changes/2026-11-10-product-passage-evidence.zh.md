---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-10-product-passage-evidence

[English](2026-11-10-product-passage-evidence.md) | 中文

## 概述

新增版本 2 产品证据和检查点事件，以及按问题选择原文位置的模型请求与结果事件。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-product-passage-evidence
baseline: false
changes:
  - root: "event:product/checkpoint-v2"
    previous: null
    after: "0e36a5f3263ab61a8b3f6e9a98352544e326d63bd760563b8522c2c075475a03"
    decision: same-version
  - root: "event:product/evidence-v2"
    previous: null
    after: "c59db7efe0b9f34236123bab69f2727dd0490adb8fc83c427fe8c16a6b9aae58"
    decision: same-version
  - root: "event:product/passage-model-request-v1"
    previous: null
    after: "f82cfb258d8f114d99dca5e91a57fbc8be58b39c3d7906a1ac5df9d7e114532d"
    decision: same-version
  - root: "event:product/passage-model-result-v1"
    previous: null
    after: "c4a0f7f3ae46fea3fd167769456ae60fc48a470929cab0e652c7f4ee498148c7"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

既有 product/evidence-v1 和 product/checkpoint-v1 事件结构不变。读取方兼容两组事件。版本 1 至 3 检查点继续原分片算法；版本 4 按保存的问题游标续跑，并要求版本 2 证据。复用前逐段按保存的来源哈希和原文位置重新核对。旧读取方可忽略新事件名，不会误读旧记录。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/product-insight/source/tests/passage-index.spec.ts packages/product-insight/workflow/tests/investigation.spec.ts --reporter=dot：43 个测试通过，覆盖多段原文位置、旧版恢复与版本 4 问题游标恢复。pnpm run build:artifacts：7 项检查通过。

<a id="dev-note"></a>
## 开发备注

无。
