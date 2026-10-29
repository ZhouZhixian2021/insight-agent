---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-29-academic-quote-tiering

[English](2026-10-29-academic-quote-tiering.md) | 中文

## 概述

新增第 2 版候选初筛与语义审核记录：相关匹配可以不带引文，初筛记录可声明版本 2。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-29-academic-quote-tiering
baseline: false
changes:
  - root: "event:academic/background-run-state"
    previous: "2026-10-27-academic-trace-auto-delivery"
    after: "d7bd460dd1ee6d543d8b185eb6f42c61a6d0dd3aa7313ea934321f31f3a8c5a4"
    decision: same-version
  - root: "event:academic/candidate-semantic-review-verified-v1"
    previous: "2026-10-21-academic-u0-events"
    after: "3a740349fdb1cc27920159cba34bd31b29f890b73ae98a923b60599bf817ea3e"
    decision: same-version
  - root: "event:academic/recovery-checkpoint"
    previous: "2026-10-29-academic-fulltext-admission"
    after: "a0e93f894e67bddefcdfd996f1b7d3213a481ef8f1074597ca3f98ed79a7afcd"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

版本 1 写入的记录含义不变且继续可读：已存的每条信号仍带引文，版本 1 审核仍要求每项匹配都带引文。新记录改变了两处联合类型和一处判别值集合：语义审核记录可能保存版本 2 判断，初筛详情可能声明 schemaVersion 2，已存引文可能缺失。本构建的读取方接受全部组合。旧构建读取版本 2 记录时会把缺失的引文当作必需项；不支持用旧构建恢复本构建写入的 Session，也没有迁移会重写更早的记录。

<a id="verification"></a>
## 验证

解析器、初筛、排序与控制器定向测试覆盖两个版本、排除降级与更新后的候选审核指令；提示词快照已重录。持久化目录与本确认记录在同一改动中生成并校验。

<a id="dev-note"></a>
## 开发备注

无。
