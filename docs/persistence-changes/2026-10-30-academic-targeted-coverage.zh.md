---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-30-academic-targeted-coverage

[English](2026-10-30-academic-targeted-coverage.md) | 中文

## 概述

增加 schema-2 定向覆盖补强状态、冻结的原文/token/时间/候选上限、调用预留、证据摘要及可选补抽路由。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-academic-targeted-coverage
baseline: false
changes:
  - root: "event:academic/coverage-repair-state-v1"
    previous: "2026-10-30-academic-aspect-coverage"
    after: "54d1979b7c482ad5bcb68a76a1e5d53f4039758ed1a4fcd1788fbdf4bdb450f8"
    decision: same-version
  - root: "event:academic/recovery-checkpoint"
    previous: "2026-10-30-academic-aspect-coverage"
    after: "ea62d2cb17ca9804ad7adf7e54170d86a59da1b48ec6e224b34925bb0fa52347"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

Session 头部保持版本 4。必需覆盖事件使用补强状态 schemaVersion 2 表示定向策略。历史读取程序验证 schemaVersion 1，拒绝 schema-2 可执行恢复，不会重置预算。当前读取程序仅接受不含 targeting 的历史 schema-1 状态，保留原冻结策略。模型边界验证可选路由与缺口短语；历史字段缺失不授予新工作额度。模型调用前持久化额度预留；恢复拒绝字符、候选补读、起始时间及已结算或中断预留回退。

<a id="verification"></a>
## 验证

27 项覆盖、定向补强和恢复测试通过，包括拒绝 schema-1 定向状态及中断/回退检查。真实 Loader 的定向覆盖场景已通过并记录为可无密钥回放的快照。已有快照继续覆盖历史算法。

<a id="dev-note"></a>
## 开发备注

无。
