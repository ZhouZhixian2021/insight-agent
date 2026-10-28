---
description: "在实施前核对学术事件审计、序号映射与相邻迁移方案。"
owner: "A"
created: "2026-10-22"
expires: "2026-11-22"
promotion-target: "经核对的迁移规范与包文档"
---

# G02 学术历史迁移核对

[English](index.md) | 中文

## 摘要

本参考用于核对 A 升级路线的 G02 迁移范围。审计覆盖固定 T0 源码、锁定的 U0 发布版及证据中标识的 A 源码快照。已核对的 2→3→4 学术迁移现已实施，聚焦包检查通过；完整历史副本导入尚未运行。现有批准和 Brief 身份规则继续适用。

## 目录

- [核对材料](#review-materials)
- [证据与维护](#evidence-and-ownership)
- [Dev Note](#dev-note)

## 核对材料
<a id="review-materials"></a>

以下三份参考保留已观察到的事件事实，以及实施前核对过的方案。

- [事件清单](event-audit.zh.md)：19 类声明、写入和消费关系及录制覆盖。
- [字段与引用映射](field-mapping.zh.md)：8 个 Session 引用、完整顶层字段、保留的身份和普通计数。
- [最小迁移方案](minimal-plan.zh.md)：已核对的相邻边范围、历史子证据读取与拒绝限制。当前行为以对应包文档为准。

## 证据与维护
<a id="evidence-and-ownership"></a>

负责人 A 应在到期日前复核本暂存参考。已确认行为归入对应迁移规范和包文档；此方案作为核对材料保留。这些页面未纳入公开文档站点列表。

[审计证据](audit-evidence.json)记录源码 tree/blob 对象、声明字段、8 个引用位置、普通数字路径和冻结录制哈希。[历史写入证据](historical-writers.json)通过源码 blob 和行号定位已退役筛选写入器。完整提交标识保留在既有外部升级登记与 Git 历史中；本次纳入不增加文档检查例外。

此前审计已核对 223 份冻结副本与 4,701 个保护文件。本次不复制冻结录制或私有 Session 数据。外部审计原件保持不变；仓库内机器证据不复制源码注释，使用源码对象定位。

## Dev Note

<details>
<summary>待核对</summary>

这是审计和设计记录，不是完整导入验收。不得据此推断批准、映射 Brief 身份、启动模型运行或发布 Session 新代。A-U2 对照表记录实施检查与仍待完成的副本导入验收。

</details>
