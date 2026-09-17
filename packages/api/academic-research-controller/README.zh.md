---
description: "依托 Session 执行一轮有界 Academic 研究的 Remote 入口。"
kind: "package-reference"
---
# Academic Research Controller

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-api-academic-research-controller` 负责 `ctx.remote.academicResearch.run`。一次调用解析既有 Session Agent，从计划审批记录重建 ResearchBrief，复用 Session 选择的模型，检索所有已注册的学术来源，执行确定性的元数据筛选，获取全文，使用模型复核自然语言范围规则，抽取证据并返回经过评测的草稿。

## 目录

- [使用方式](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用方式

将控制器与 `academicSource`、`sessionController`、`typert` 和 `web` 一起挂载。Web 应用在 Academic 来源运行时中挂载 arXiv、CVF、ACL Anthology 与 PMLR Provider。请求传入 Session ID、查询、可选结果上限及合成数据声明。控制器读取该 Session 最近一次成功的 `exit_plan_mode` 审批，校验其中唯一的 `academic-research-brief-json` 区块，并补充稳定身份、版本 1 和审批元数据，因此调用方不能替换成未经审批的 Brief。模型选择仍归 Session 所有。

操作通过 `runMaintenance()` 占用 Agent 的空闲阶段。Academic 预设在计划获批后结束当前轮次，客户端等待 Session 空闲后再启动该操作。正在执行的聊天或其他维护操作返回 `session/agent-busy`。Remote 取消与 Agent 取消合并为同一个信号。整轮完成或观察到取消后，响应返回工作流结果和 Session ID；该接口不提供断线恢复。

元数据选择使用规范版本、批准的论文类型、预印本策略、发表时间范围、撤稿状态和纳入数量上限。每个来源 Provider 提供自己的有序全文候选。全文解析后，模型返回明确的纳入或排除决定及原因；被排除论文保留在论文结果中，但不向分析提供证据。

-----

<a id="model-experience"></a>
## Model Experience

### Academic 研究运行

#### What the model sees

控制器不增加提示词。它将批准的 `inclusionRules` 和 `exclusionRules` 交给 Academic 工作流的逐篇模型请求，并使用 Session 已选择的提供方和模型。

#### Token effect

每篇被选论文最多产生一次有界的范围与证据请求。如果估算输入加输出预留超过所选模型的上下文窗口，工作流会在发送前暂停该论文。

#### KV Cache effect

各论文独立请求，不重放 Session 对话。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- CVF、ACL Anthology 与 PMLR 只搜索 Web 组合配置的目录页；新增会议或论文集只需修改配置。
- 一次 Remote 调用会保持到整轮结束。工作流恢复、进度流、持久运行身份、重试和长论文分段留待后续。
- 当前每份获批计划都会建立版本 1，其身份由 Session 和获批计划调用共同确定；对已批准 Brief 进行后续版本修订留待后续。

-----

<a id="dev-note"></a>
### 开发备注

参见 [Academic Remote 执行决策](../../../.agents/notes/implemented/architecture/2026-09-16-academic-remote-execution.zh.md)。
