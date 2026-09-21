---
description: "生成可追溯的中文 Markdown 草稿，并在最终报告出口核验证据与审核。"
kind: "package-library"
---

# @deepseek-ai/dsh-academic-report

[English](README.md) | 中文

## 概述

生成可追溯的中文 Markdown 草稿，并在最终报告出口核验证据与审核。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

传入已验证的 `synthesis` 与实际 `coverage` 后，`generateReport()` 渲染批准的问题、保留的段落和数字引用。被拒候选段落序号和原因进入局限与 `unmet_plan` 评测问题；被拒正文不进入结论、Claim 或正文字数。受影响的问题和章节披露覆盖不足。每个合格段落只展开一次，标题、引用、附录和重复内容不计入正文长度。书目与摘录来自输入记录。局部恢复不代表满足 Plan 或语义审核通过，洞察报告仍仅允许草稿。

`generateReport()` — 传入共享模型记录、论文书目信息、明确的草稿或最终模式、合成数据标志和局限说明。报告生成内部执行评测。草稿披露检查失败和待语义审核状态；最终模式拒绝检查未就绪或合成数据。原文片段、证据 ID、实际版本和引用版本均可追溯。Markdown 内容经过转义，仅激活 HTTP(S) 来源链接。

本包是无状态函数库，不发布 invariant 伴随模块；自动化测试核验输出关联和失败行为。

<a id="model-experience"></a>
## 模型体验

### 返回结果

#### 模型看到的内容

`generateReport()` 仅返回数据，不发送模型请求。

#### Token 影响

无直接消耗。消费方负责后续渲染和记录请求。

#### KV Cache 影响

本包不操作模型缓存。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 使用受支持的 Plan 中文章节和数字引用；不提供 PDF、DOCX 或语义审核服务。调用方须如实标记合成材料。本包不是 Session 工作流或发布审批服务。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文</summary>

固定基准与检查结果见 [中文开发记录](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md)。

</details>
