---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-08-product-gap-reread

[English](2026-11-08-product-gap-reread.md) | 中文

## 概述

为产品来源的正文补读增加可选的完成标记。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-product-gap-reread
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-08-product-fragment-overlap"
    after: "a5bd59fda459069032a48cf261d697935369c674ab9f609d50919d38b33b9638"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有检查点省略该标记。新版运行器读到这些检查点时视为尚无已提交的补读。旧版会话读取器会保留现有检查点事件中的额外字段。旧版产品运行器会在派发前拒绝包含新字段 maximumGapReads 的计划。会话格式和阶段名称沿用原值。

<a id="verification"></a>
## 验证

来源与工作流的 36 项测试通过，覆盖旧检查点续跑和缺口证据提交后重启。产品洞察 Loader 的 5 项测试通过，覆盖重新读取已保存检查点、补读成功以及片段无匹配时回退到获批补搜。

<a id="dev-note"></a>
## 开发备注

无。
