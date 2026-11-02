---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-30-academic-publication-dates

[English](2026-10-30-academic-publication-dates.md) | 中文

## 概述

新增明确的学术发布日期政策、冻结的运行上下文、逐篇日期裁决、内容规则引用及版本化的日期上下文会话事件。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-academic-publication-dates
baseline: false
changes:
  - root: "event:academic/background-run-state"
    previous: "2026-10-29-academic-quote-tiering"
    after: "150be891954a070ad8485f8e48d38b16b4f37e01d78013f3feafc1e0312a4b70"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-verified-v1"
    previous: "2026-10-29-academic-quote-tiering"
    after: "819b0441c374444a543de8c6063a96acdd559d558e9e8636a459a9399a92de80"
    decision: same-version
  - root: "event:academic/publication-date-context-v1"
    previous: null
    after: "91a7ad3abf95088bc53d4453d0c6188f5d7c4499488fb023e037e85a70354c7c"
    decision: same-version
  - root: "event:academic/recovery-checkpoint"
    previous: "2026-10-29-academic-quote-tiering"
    after: "7874d50692bdd3bf00b0c3bb34818942312e80d6b821fdb4fee198ccbd2f9c0c"
    decision: same-version
  - root: "event:academic/synthesis-request"
    previous: "2026-10-29-academic-scope-screening"
    after: "6f33ffcda37efdc9215f73290ea81a115bfa5851f3b0f63a7e98eb4a76564eae"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

原有字段含义不变，已有记录上的新增字段均为可选。历史计划与 Session 日志世代不改写。新计划版本 6 要求明确政策；旧计划若上限为空且日期规则未分类，执行前必须重新审核，已有有效固定上限继续支持。新写入方在明确政策的工作开始前记录 academic/publication-date-context-v1；旧读取器会安全拒绝这一未知的必读事件。新读取器接受缺少可选字段的旧记录，不为含歧义的旧计划臆定截止日。恢复沿用保存的日历日期，不使用恢复时钟。双向读取均保持同版本安全解释或明确拒绝。

<a id="verification"></a>
## 验证

学术工作流、检索及研究控制器共 664 个测试通过。离线 academic-publication-date SDK Loader 会话快照通过，覆盖两种证据模型路径，拦截以虚构 5 月 7 日为截止日误排 9 月 1 日论文的结果。回归覆盖日期边界、来源精度、未知日期、日期口径、上海与 UTC 跨日、次日恢复、政策校验及内容排除。

<a id="dev-note"></a>
## 开发备注

无。
