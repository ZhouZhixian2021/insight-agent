---
description: "整理可追溯的跨论文分析证据，并定位被排除或不完整的材料。"
kind: "package-library"
---

# @deepseek-ai/dsh-academic-analysis

[English](README.md) | 中文

## 概述

调用方通过 `prepareAnalysisInput()` 按学术成果和实际内容版本整理证据卡片条目。`analyzeEvidence()` 使用共享 Claim、证据关联和快照生成注明论文归属的方法与发现对比。这个抽取式基线不执行检索、模型请求或持久化，最终交付前必须完成语义审核。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

按 [AnalysisInput](src/types.ts) 的字段名称传入具有类型的 `AcademicWork`、`WorkVersion`、`EvidenceRecord`、`EvidenceCard` 和 `SourceLocator` 数组。调用同进程函数前，外部 JSON 由其入口负责人校验。至少保留一个卡片条目时返回 `usable`，否则返回 `no_usable_input`；`usable` 不证明证据充分、内容真实或指标可以比较。

论文或版本缺失、归属不一致以及版本撤回会导致卡片被排除。证据或定位缺失、版本或等级不匹配、已知内容哈希冲突以及元数据用于支持实质性陈述会导致整个条目被排除。即使其他引用有效，一条无效引用也会排除整个条目。任一输入对象集合内出现重复 ID 时抛出错误，不任意选择记录。其他有效条目继续保留。

输出按输入论文顺序分组，版本和卡片按卡片输入顺序排列，条目保持原分区顺序。同一学术成果只计一次，但保留不同实际证据版本，包括未提供正式引用版本时可访问的预印本。记录与定位保留来源信息。对象通过只读引用共享；函数不修改输入，也不创建持久化快照。

条目中不可用的字段保留原始 `Availability` 值，并生成带位置的限制。有效条目为空的分区、仅摘要支持、缺少原文片段以及哈希不可用也会生成限制。这些标记不补造字段，也不证明论文或研究方向不存在。函数不产生排名或自动可比性判断。

参见[固定合成测试](tests/prepare.spec.ts)和[共享模型](../model/README.zh.md)。本库没有可能相互偏离的运行时观测，不发布 invariant 伴随模块；聚焦测试检查返回结果的关联。

<a id="model-experience"></a>
## 模型体验

### 整理后的材料

#### 模型看到的内容

没有直接可见内容。`prepareAnalysisInput()` 向调用方返回有类型的材料，不发送模型请求。

#### Token 影响

直接 Token 消耗为零；渲染和请求日志由消费工作流负责。

#### KV Cache 影响

本包不发生模型请求或缓存操作。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 整理视图仍归 analysis 内部所有。生成结论使用 A5 Claim 类型；抽取式对比不排名指标，也不推断共识、趋势或研究空白。
- 结构检查不核验引文是否存在于完整来源中，不比较实验条件，不执行已批准 Brief 的要求，也不查询外部存储判断证据是否陈旧。缺少原文的材料保留明确限制。
- 返回子集是整理视图，不替代生产者卡片，也不是持久记录。不能沿用原卡片 ID 将其作为新来源证据持久化。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

根 TypeScript 工程和工作区锁文件已包含本包。验证结果和剩余文档集成事项见[开发记录](../../../z-team_docs/开发记录/2026-09-14-ykxy11-分析输入准备.md)。

</details>
