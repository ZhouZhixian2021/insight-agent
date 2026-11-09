---
description: "供产品洞察共用的产品身份、调查记录、证据关联及计划审批和结论时效纯检查。"
kind: "package-library"
---

# @deepseek-ai/dsh-product-insight-model

[English](README.md) | 中文

## 概述

产品洞察各模块通过本包交换带版本的计划、候选网页、资料快照、证据和结论。本包创建独立 ID，并检查计划当前版本是否获批、批次是否部分成功及引用资料是否变化。本包不执行搜索、网页获取、模型调用、持久化或报告渲染。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

来源、工作流、报告、控制器和浏览器包在后续实现时将通过[公开入口](src/index.ts)使用这些类型。`isExecutableProductPlan()` 只接受当前版本获批的计划。`createProductBatchResult()` 同时保留成功记录和失败记录；有效搜索没有结果仍为成功。`checkProductClaimFreshness()` 比较结论所用计划、证据和网页内容；返回 `current` 仅表示资料未发现变化，不代表结论语义正确或报告可以交付。

-----

<a id="understand-the-implementation"></a>
## 实现说明

<details>
<summary>展开实现说明</summary>

[共享类型](src/types.ts)区分候选网页与每次成功或失败的获取记录；只有成功的快照带有正文位置及内容校验值。计划可批准每页正文上限、针对问题缺口的补充搜索次数、外部发布方，以及明确的地区、版本和日期要求；成功快照可记录网页自报的发布方、日期、地区和版本，缺失字段不视为已知。证据保留准确的资料快照，结论保留分析时的计划版本与内容身份。[ID 函数](src/ids.ts)使用品牌化 UUID。[时效检查](src/claim-freshness.ts)将已知变化标为过时，将缺少当前资料标为无法核实，不改写历史结论。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [产品洞察子系统](../../../docs/subsystems/product-insight.zh.md)说明共享记录的语义。
- [团队字段方案](../../../z-team_docs/产品洞察/接口约定/00-首版共享字段方案.md)记录 A、C 交接及首阶段调查范围。

-----

<a id="model-experience"></a>
## 模型体验

无直接影响：本包只定义调用方持有的记录和纯判断，不请求模型，也不生成模型可见文本。

#### KV Cache effect

无直接影响；后续使用方负责将这些记录序列化到模型请求中。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **不做语义审核** — 时效检查只比较来源身份和内容变化；报告模块仍须检查证据是否真正支持结论。
- **不校验传输数据** — 解析器和远程接口使用方须在读取不可信或持久化数据时进行校验。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>展开维护说明</summary>

控制器、正式报告和浏览器页面仍需分别实现；本模型包不代表完整的产品调查流程已经交付。

</details>
