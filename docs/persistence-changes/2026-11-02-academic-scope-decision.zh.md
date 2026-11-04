---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-02-academic-scope-decision

[English](2026-11-02-academic-scope-decision.md) | 中文

## 概述

在学术洞察合成请求携带的 Brief 中增加可选的已审核范围取舍。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-02-academic-scope-decision
baseline: false
changes:
  - root: "event:academic/synthesis-request"
    previous: "2026-10-30-academic-aspect-coverage"
    after: "076f610dd4a94e1fb4ea1996c58168065efe7c4150b0a64c7784e582ea656a0d"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有 synthesis-request 事件缺少该字段，保持原有含义。新读取程序对缺失字段按历史范围未披露处理，不推断未覆盖方向。新增字段为可选字段；旧读取程序仍可使用请求中的已批准问题与证据，而无需解释额外的方向披露。该字段不改变合成请求身份或已接纳的证据记录。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/academic/research-controller/tests/plan-validation.spec.ts packages/academic/report/tests/directions.spec.ts：79 个测试通过。pnpm run build 通过。

<a id="dev-note"></a>
## 开发备注

无。
