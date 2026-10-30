---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-30-academic-question-coverage

[English](2026-10-30-academic-question-coverage.md) | 中文

## 概述

增加排序批次结算前的问题覆盖模型完整请求与尝试记录。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-academic-question-coverage
baseline: false
changes:
  - root: "event:academic/coverage-request-v1"
    previous: null
    after: "e47297e49c1814f5b471d81d4039b9fc3df9b0218808ea051455ad17e43fc97e"
    decision: same-version
  - root: "event:academic/coverage-result-v1"
    previous: null
    after: "0f561cf29591915cdcc969c6ce07673cddc3a55e8dd53eeddef76680e251b4aa"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

既有事件字段和历史 Session 文件代际保持不变。新读取方接受没有覆盖记录的旧运行，并在恢复时评估保留证据。新判别字段标识读取时必需的覆盖记录；不认识这些记录的旧读取方会拒绝读取，不会把未经评估的问题关联当成完整回答。不引入迁移、回退或降级支持。

<a id="verification"></a>
## 验证

已从代码审阅请求持久化、解析器引用校验和保守失败处理。按用户要求未运行自动化测试。

<a id="dev-note"></a>
## 开发备注

无。
