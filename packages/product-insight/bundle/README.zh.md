---
description: "在 DSH Web 配置中增加可选择的产品洞察预设。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-product-insight-bundle

新计划仅在预计来源网页提供对应声明时设置可选 `sourceCriteria`。宽泛的市场或发布时间范围留在调查范围和问题中，不当作网页元数据的逐字匹配标签。

[English](README.md) | 中文

## 概述

本接入包在 Web Agent 的模式选择器中加入“产品洞察”。计划获批后，会话所属后台任务搜索获批来源、提取并审核证据、核对独立佐证，保存带引用的报告或列明缺口的草稿。对话阶段卡展示实时进度、计数、Trace 和已保存报告。

当前预设通过本地多引擎 `product-free-search` 搜索，并用 `product-public-page` 获取正文；已安装插件的搜索转接仍保留供明确选择。

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

内置 Web 配置在学术接入包之后加载本包。开始新任务时选择“Product Insight / 产品洞察”。Agent 会展示产品、范围、问题、资料办法、获批外部发布方，以及需要的地区、版本或来源日期要求、候选页和缺口补搜次数，并说明每页正文与总耗时是否设有上限及预期结果，并附结构化执行区块；用户可以批准或要求修改。官网通过 `product.officialUrl` 获批；`sourcePublishers` 只列出域名不与官网重叠的外部发布方。批准后，对话中会显示产品洞察五阶段卡：页面获取、证据提取、语义审核、独立佐证和报告生成，同时展示数量、未达标原因，并可展开阅读或下载已保存报告。批准后结束计划聊天轮次，由宿主启动已保存的计划；对话卡直接展示进度与正式保存的报告，不再通过完成通知唤醒聊天模型重写。任务中断后，再次明确调用可从同一获批计划已提交的工作续跑，包括已完成的页面片段；后续新调查仍先提交新计划。搜索与获取使用已配置的 DSH Web 提供方。

-----

<a id="understand-the-implementation"></a>
## 实现说明

<details>
<summary>展开实现说明</summary>

[预设补丁](presets/product.patch.yml)声明产品调查指令、计划模式、提问工具、通用 Web 工具及产品工作流插件。提交审核前会检查 `product-insight-plan-json` 区块；工作流工具使用 Web 和模型服务前会再次核对持久审批。[Web 补丁](web.patch.yml)注入本功能自有的会话投影，通过 Conversation Definition/slot 边界折叠产品工作流的持久事件，使实时更新和历史会话回放呈现同一阶段卡，同时不修改公共框架提示词或页面组件。

产品预设使用隔离的 Web 注册表。计划阶段工具与后台调查使用本地 `product-free-search`，网页获取仍使用 `product-public-page`。搜索结果识别与后台模型调用使用会话选定的模型，不配置备用线路。已安装的 `dsh-web-tools` 搜索转接仍可明确选择；其他预设保留各自搜索配置。修改预设后请重启服务并新建产品洞察会话。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [产品来源包](../source/README.zh.md)提供独立的程序化候选发现接口。
- [DSH Web](../../web/web/README.zh.md)说明搜索提供方选择。

-----

<a id="model-experience"></a>
## 模型体验

通过产品预设插件间接影响模型。

#### KV Cache effect

选择本预设后，角色指令、计划阶段指令和工具定义与其他模式不同；同一会话后续轮次继续使用这套组合。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 后台任务归属 Agent 且在当前进程中运行。进程重启后可将已保存状态识别为中断；再次明确调用可从该计划最近的完整检查点续跑。自动续跑仍需后续实现；当前阶段卡是 Session 会话投影，不是独立任务控制页面。正式状态要求异站支持且没有未解决冲突，并不证明发布方独立或产品实际行为。
- 预设需要 Web 与基座接入包以及已配置的搜索提供方。

### 开发备注

<a id="dev-note"></a>

<details>
<summary>展开维护说明</summary>

产品会话展示保留在本接入包，持久调查状态保留在工作流包。新增展示字段时应扩展 Session 事件和投影，避免让阶段卡依赖 Agent 回复。

搜索线路记录：2026-11-10 的 vivo 调查中，免费搜索端点曾反复返回 HTTP 202 或无法识别的 HTML，因此临时改用已安装插件。当前预设已按要求切回 `product-free-search`，保留来源插件与 `fetchProvider: product-public-page`；已安装插件转接仍可选用。重启 Web 并新建产品洞察会话后，应分别验证计划阶段搜索和后台候选发现。

</details>

产品模式自行注册后台任务控制器，不挂载通用任务完成通知。新计划批准后，在计划轮次结束时自动启动；拒绝或关闭审核不启动。`run_product_investigation` 保留用于用户明确要求续跑，`cancel_product_investigation` 用于明确要求取消；工具完成后结束本轮，不要求模型重写报告。重启服务并新建产品会话即可验证新预设。历史报告仍可读取，历史未完成计划不会被静默重启。
