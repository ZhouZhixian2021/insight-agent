---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-29-academic-fulltext-admission

[English](2026-10-29-academic-fulltext-admission.md) | 中文

## 概述

为学术恢复检查点的策略增加可选全文准入限制。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-29-academic-fulltext-admission
baseline: false
changes:
  - root: "event:academic/recovery-checkpoint"
    previous: "2026-10-21-academic-u0-events"
    after: "61471586a9abf01fd7a87fc04fa5d520e48ab86620f0bdb3c5699b8eeba5b2cb"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

历史检查点缺少 policy.fulltext，保留原调度行为。新检查点保存总全文与不确定论文限制；当前恢复按已调度身份计数，不重新发放额度。旧读取器忽略可选对象，继续解释既有必需检查点字段；恢复需要执行全文限制的运行时应使用当前读取器。事件判别标签及已发布日志代际均不变。

<a id="verification"></a>
## 验证

定向批次、补检及 Controller 测试覆盖历史策略、已用全文限制及待处理批次恢复。整篇片段上限与缓存内容不新增 Session 字段。

<a id="dev-note"></a>
## 开发备注

无。
