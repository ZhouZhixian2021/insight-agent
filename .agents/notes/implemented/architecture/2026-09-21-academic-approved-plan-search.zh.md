# Agent Note: 从已批准的学术计划发起检索

Status: implemented

[English](2026-09-21-academic-approved-plan-search.md) | 中文

## 问题

用户批准研究意图后，还要在另一张表单中填写检索表达。这些表达可能偏离计划，也要求普通用户理解检索术语。

## 决策

Academic 预设在生成 Research Brief 的同一轮计划中生成查询。第 3 版结构化计划交接必须包含 `searchPlan`，每项包括实际 `query`、中文 `purpose`、对计划 `questions` 的引用，以及获批的 `retrieval` 策略。可读中文计划说明启用的渠道、直接 Academic Provider、引用核验 Provider 及 Web 发现和核验预算；用户无需填写 id、枚举或 JSON。

第一版策略支持 `academic` 与 `web_discovery`。直接检索允许 OpenAlex 与 arXiv；引用核验允许 OpenAlex、arXiv、ACL、PMLR 与 CVF。Web 发现和核验上限为非负数且不得超过 8，并且只在启用 Web 发现时必须为正数。Provider 列表只在对应渠道需要时必须非空。校验拒绝未知或重复渠道/Provider、空白或不支持的 Provider、未知字段、负数或超限预算，以及检索表达相同但策略不同的重复项。

校验还检查非空表达、问题归属与覆盖，以及既有三条查询和已批准轮次上限。使用相同策略的完全重复表达只执行一次，同时保留其用途与问题关联。

Controller 负责这份编排交接，单独提取既有第 1 版领域 Brief，因此 Academic model 类型保持不变。第 1、2 版历史交接仍可读取；缺少检索方案时，必须补齐并重新批准才能开始研究。系统不从主题猜测缺失查询，也不悄悄修改已批准要求。在 A-H3 消费策略前，预览可以展示第 3 版计划，但执行会拒绝启动；禁止静默忽略已批准渠道或 Provider 上限。

Web 先通过 `academicResearch.plan` 预览最近一次已批准计划，展示主题、研究问题和中文检索方向，不提供查询输入框。启动时将预览的 `researchBriefId` 传给 `academicResearch.run`；Controller 重新读取批准记录，身份变化时在检索前拒绝。既有空闲会话维护操作通过原流水线执行保存的查询。`RetrievalRun.queries` 保留实际尝试的表达，运行中的 Brief 身份可关联回审核计划。

## 考虑过的替代方案

批准后单独调用模型会增加等待，并产生未经审核的查询生成步骤。直接拼接主题别名虽不增加调用，却不能表达互补的研究问题。在计划阶段生成有界查询，可让用户审核其研究意图，无需编写技术表达。

## 结果

本决策替换[明确查询决策](2026-09-18-academic-explicit-query-orchestration.zh.md)中的手填查询 Remote 输入。来源顺序执行、候选去重、版本与时间筛选、抽取及报告合成保持不变。批准后立即自动研究和自适应补充检索继续延期。预览不调用模型或来源；开始研究仍由用户单独触发。

Controller 与 Web 测试覆盖保存查询的执行、批准身份检查、旧计划修复、非法查询与策略、依赖渠道的 Provider/预算一致性、预览失败和取消。中文计划与固定策略夹具验证版本化交接，不代表真实模型的规划质量。按策略执行检索仍归 A-H3 所有。
