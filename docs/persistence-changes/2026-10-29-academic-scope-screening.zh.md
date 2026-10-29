---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-29-academic-scope-screening

[English](2026-10-29-academic-scope-screening.md) | 中文

## 概述

为学术范围审核请求增加可选的定向筛选记录；此前记录的请求仍可读取。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-29-academic-scope-screening
baseline: false
changes:
  - root: "event:academic/candidate-screening-request"
    previous: "2026-10-21-academic-u0-events"
    after: "390fbd81f8ac356d4cab60f99c36f2e9f7aebd206b3a6484a42c2843738deff9"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-request-v1"
    previous: "2026-10-21-academic-u0-events"
    after: "94c0a474782b49d351998215d0c450a41c3fd000f8a1856ba742f2e6e74105c9"
    decision: same-version
  - root: "event:academic/evidence-request"
    previous: "2026-10-21-academic-u0-events"
    after: "24fcde40400fd2dc9562116a3f0a34001028c0374353ba43b8f32c81d384eacf"
    decision: same-version
  - root: "event:academic/synthesis-request"
    previous: "2026-10-21-academic-u0-events"
    after: "f9aaf313699cda70b0cdf22aa6ed3acc47fc5ff3a048a83c140c742f2071f33d"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

历史范围审核请求不包含 screening 对象，保持原有的顺序批次行为。新请求记录每次调用实际提交的片段与剩余调用预算，使恢复或重放的运行读取相同材料。事件判别字段不变；旧读取方忽略该可选字段并保留所有必需请求字段。

<a id="verification"></a>
## 验证

选择器、范围审核和候选批次定向测试覆盖调用预算、掩码补读、未覆盖条件与保留配额；持久化目录与本确认记录在同一改动中生成并校验。

<a id="dev-note"></a>
## 开发备注

无。
