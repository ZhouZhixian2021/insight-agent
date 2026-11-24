---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-24-product-paragraph-review-repair

[English](2026-11-24-product-paragraph-review-repair.md) | 中文

## 概述

产品网页检查点可记录提要原有段数和部分审核后略去的段号。审核失败事件可标明模型已返回完整响应，其中有段落决定未通过校验。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-24-product-paragraph-review-repair
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-23-product-page-summary-review"
    after: "46ee65aa64278ef7db6d42b3eaa08d46d52fd95b776c9ded3376d7439f757ecf"
    decision: same-version
  - root: "event:product/page-summary-result-v1"
    previous: "2026-11-23-product-page-summary-review"
    after: "9c160f028c6d308225420d8316d6daeba19475d3e5dde971fbee760270348d53"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

两项字段均可省略。现有检查点继续使用已审核段落。续跑时会校验记录的缺失段号，只对相同网页快照、模型和完整请求重新解析带标记的响应。旧读取方可以使用已保存的审核段落，并在需要时重新发起失败的审核请求。

<a id="verification"></a>
## 验证

investigation.spec.ts 和 extraction-model.spec.ts 的定向用例覆盖部分通过后的报告、引文核对、两次局部修订、越界缺失段号拒收、取消与中断续跑。用五段提要的真实响应离线回放时，剩余段落两次修订仍失败，其余四段保留。

<a id="dev-note"></a>
## 开发备注

无。
