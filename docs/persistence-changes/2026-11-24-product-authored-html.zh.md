---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-24-product-authored-html

[English](2026-11-24-product-authored-html.md) | 中文

## 概述

产品报告事件可以同时保存已完成的离线 HTML 和 Markdown 文本。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-24-product-authored-html
baseline: false
changes:
  - root: "event:product/report-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "960c119845fb739dfb0786e59d6b13a626475de8d0afa1866d70729582207e53"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

HTML 字段可以省略。历史会话沿用已保存的 Markdown。旧客户端可以读取新事件中的 Markdown。写入事件前已将角标关联到实际来源，并嵌入所选原图。

<a id="verification"></a>
## 验证

报告测试覆盖来源关联、原图内嵌和读者下载。11 月 24 日的 M6 写作回放使用已保存的提要与图片，并离线打开了成稿。

<a id="dev-note"></a>
## 开发备注

无。
