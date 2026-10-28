---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-27-academic-trace-auto-delivery

[English](2026-10-27-academic-trace-auto-delivery.md) | 中文

## 概述

新增必读的 academic/trace-v1 事件，并为 academic/background-run-state 结果中报告评估问题增加可选的 category。当前 Session 写入格式保持为 4，完整后台运行载荷继续使用 schemaVersion 1。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-27-academic-trace-auto-delivery
baseline: false
changes:
  - root: "event:academic/background-run-state"
    previous: "2026-10-21-academic-u0-events"
    after: "4597342e218fd6a219340f0cedc4d3cfba1f8f511ebfba2a7004391e2e11f148"
    decision: same-version
  - root: "event:academic/trace-v1"
    previous: null
    after: "7df75da42abf2dcc007dd64d72e5778dafd6eb32dd581753371b4abc39685639"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

不含 category 的已有后台运行结果继续可读。可选的 delivery/content 分类补充每项问题已记录的 code 和 message；缺失不代表交付成功或语义批准。读取器保留历史报告状态和身份，不重新分类或改写已存报告。

academic/trace-v1 是必读事件。不认识该标签的读取器按必读事件准入规则拒绝历史，本记录不声称对这些读取器透明兼容。当前读取器接收其已声明载荷，已审计的 V2 到 V4 路径保留持久化的运行／span 身份、诊断值和 null，只映射事件本身的位置。Session header 版本未变，不代表可以丢弃事件或补造历史 Trace 观察。

历史 V2 schema 现在仅为这些报告问题接收可选的 delivery/content 分类，既有必填字段不变。两级迁移均保留已提供的分类，也保留字段缺失；不支持的分类值会被拒绝。因此，旧格式使用明确的专项准入，而不是仅从当前格式字段可选推断兼容。

<a id="verification"></a>
## 验证

九文件 Trace／controller／投影／迁移聚焦检查通过 430 项，零跳过，其中包含 [Trace 观察](../../packages/api/academic-research-controller/tests/trace.spec.ts)、[严格 V2 Trace 准入](../../packages/session/session-format-v2-to-v3/tests/academic-trace.spec.ts)和 [V3 到 V4 组合迁移](../../packages/session/session-format-v3-to-v4/tests/academic.spec.ts)。最后的单文件 Trace 迁移检查通过 15 项。四个所属 TypeScript 项目及原生 Host aggregate 类型检查通过，最后的两文件 lint 检查没有诊断。

两级迁移所属测试通过 172 项、零跳过，包含八个新增用例，覆盖分类缺失、delivery、content 及未知值拒绝。四文件 lint 检查通过 90 条规则，没有诊断。限定源码类型检查在 30 个根和 360 个加载文件中报告零诊断，没有加载所属包的构建声明；该结果不等同于完整构建。此前的类型发现失败仍保留在证据中。检查还确认 223 份冻结文件、T0 和既有记录的字节哈希不变。本次验证没有执行旧读取器二进制、Web 产品、ACP 或 SDK 回放，也没有改写历史 Session 文件。

<a id="dev-note"></a>
## 开发备注

无。
