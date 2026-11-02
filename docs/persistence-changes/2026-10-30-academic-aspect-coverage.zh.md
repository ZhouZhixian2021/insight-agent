---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-30-academic-aspect-coverage

[English](2026-10-30-academic-aspect-coverage.md) | 中文

## 概述

记录获批分方面要求、问题覆盖核查和有限补强额度，以及按运行区分的原文核验证据和完整模型输入、结果。报告生成输入可携带最终分方面核查。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-academic-aspect-coverage
baseline: false
changes:
  - root: "event:academic/background-run-q6-update"
    previous: "2026-10-26-academic-background-progress"
    after: "ee433f46b362605809c0356059d1c487607bca976959b97fcc3f6252c5586f3d"
    decision: same-version
  - root: "event:academic/background-run-state"
    previous: "2026-10-30-academic-publication-dates"
    after: "6f200c1b4dbf9a58c8951ba4f2a6699d24b7c560f4e90a0e64f8332f280995c7"
    decision: same-version
  - root: "event:academic/candidate-batch-settlement"
    previous: "2026-10-21-academic-u0-events"
    after: "d2f05b75d3a2b5e4e3b88f1c0b31108df955fd00a9e9f66632ce5349d5327c79"
    decision: same-version
  - root: "event:academic/coverage-repair-paper-v1"
    previous: null
    after: "30cab2a40d1f80ca3c2b1d56dce863c6a2a3c426d4019889fc767a398b79b91b"
    decision: same-version
  - root: "event:academic/coverage-repair-state-v1"
    previous: null
    after: "fb7a084884f06936ca7c1926d17125b2eb4f0f222211630ec12bd7ade9075de4"
    decision: same-version
  - root: "event:academic/coverage-review-request-v1"
    previous: null
    after: "1ea19c61c1e06667af1bd112c86d0eeb65e2ba966ec12ffa2a5a192ebf903b75"
    decision: same-version
  - root: "event:academic/coverage-review-result-v1"
    previous: null
    after: "1942bf12f4f9c081ed442cf6bb966eaafde384f5c8c7a8f58eb4ff9860b9967c"
    decision: same-version
  - root: "event:academic/evidence-fragment-verified"
    previous: "2026-10-21-academic-u0-events"
    after: "0af9028b2a139bbe773ee68c82f8e2a25555f8a0438900a966eefe8006f2ff26"
    decision: same-version
  - root: "event:academic/recovery-checkpoint"
    previous: "2026-10-30-academic-publication-dates"
    after: "0ab32d896a622da98c7e1cfef6dff4fc7f4198f7e13cd0c72b137e08d88d6ffd"
    decision: same-version
  - root: "event:academic/synthesis-request"
    previous: "2026-10-30-academic-publication-dates"
    after: "d19712a60146bc8fdaf023e8366e46c81c3f4b1a1d09411a3d035c69aba37f5b"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

历史计划和记录缺省这些可选字段，仍可读取且不会增加新要求。新增事件以必需读取的判别字段区分：旧读取程序拒绝未知事件，不会把不完整运行重建为已覆盖。当前恢复校验冻结要求和额度，保留已消耗预留并合并已提交的原文核验证据。不覆写已发布代际；事件判别字段允许安全拒绝，因此 Session 头版本不变。

<a id="verification"></a>
## 验证

覆盖额度、流程、恢复、计划校验、检索与分析共 307 个针对性测试通过。使用原 50 条证据及相同真实模型的回放完成两次核查和两篇论文的有限补抽，保留 53 条证据及问题 1、4 的剩余缺口。

<a id="dev-note"></a>
## 开发备注

无。
