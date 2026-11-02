---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-02-academic-coverage-merge

[English](2026-11-02-academic-coverage-merge.md) | 中文

## 概述

整合问题完整性评估与已有分方面覆盖类型。覆盖请求输入可包含问题方面评估和评估依据两个可选字段。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-02-academic-coverage-merge
baseline: false
changes:
  - root: "event:academic/coverage-request-v1"
    previous: "2026-10-30-academic-question-coverage"
    after: "12750c1f4f111d7aa11b6003025dd7034925e84ca571ed3b65d05b3dc702cb48"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

两个字段均为可选，已有覆盖请求仍然有效。问题完整性解析器读取获批问题和证据引用，不要求这些字段。启用分方面覆盖的任务保留有界核查器，不再分发额外的问题完整性评估。已有事件名和 Session 格式版本保持不变。

<a id="verification"></a>
## 验证

学术工作流、检索、证据、报告、来源、Controller 和扫描器相关测试通过，共 1150 项。合并后的覆盖调度和报告界面变更测试通过，共 114 项，包含分方面核查不重复分发问题评估的断言。

<a id="dev-note"></a>
## 开发备注

无。
