---
description: "产品洞察的分组目录，集中共享调查记录及后续来源到报告的流程模块。"
kind: "package-group"
---

# packages/product-insight

[English](README.md) | 中文

## 概述

产品洞察分组把产品调查代码集中在一个目录。`model` 包提供共享记录，`source` 包发现并核对网页，`workflow` 包审核摘录与跨站陈述后评估带引用报告的交付条件，`bundle` 包增加可选的 Web 模式、计划评审和会话所属后台任务。进度可通过通用任务工具查看，已保存结果可通过 `get_product_investigation` 读取。专用报告页面仍待实现。

## 目录

- [代码包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 代码包

| 包 | 职责 |
| --- | --- |
| [`model`](model/README.zh.md) | 产品、计划、网页、证据、结论、运行和报告的共享记录及纯审批、时效检查 |
| [`source`](source/README.zh.md) | 有上限的网页搜索、候选初筛、网页快照和原文摘录核对 |
| [`workflow`](workflow/README.zh.md) | 从获批计划编排调查、审核语义支持、形成暂定结论及检查报告交付条件 |
| [`bundle`](bundle/README.zh.md) | 可选择的产品洞察预设，计划获批后生成带来源的报告或草稿 |

其余三个目录仍是占位，不是已发布代码包。预定职责见[团队代码目录规划](../../z-team_docs/产品洞察/01-代码目录规划.md)。

-----

<a id="related-documentation"></a>
## 相关文档

- [产品洞察子系统](../../docs/subsystems/product-insight.zh.md)说明当前共享记录及依赖方向。
- [团队字段方案](../../z-team_docs/产品洞察/接口约定/00-首版共享字段方案.md)记录首阶段调查范围。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>展开维护说明</summary>

[模块分工](../../z-team_docs/产品洞察/模块分工/00-模块分工.md)记录 A、C 后续负责的代码范围。

</details>
