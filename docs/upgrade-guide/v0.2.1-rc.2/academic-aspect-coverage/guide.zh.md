---
kind: upgrade-guide
description: 新学术计划需要获批的分方面要求，新研究日志需要支持覆盖核查事件的读取程序。
---

# 学术分方面覆盖

[English](guide.md) | 中文

## 变更

新计划文档使用第 7 版 schema，并要求每个获批问题都有 `coverageRequirements`。第 1–6 版仍可读取，缺少此可选字段时保留原覆盖行为。新运行记录覆盖核查与补强额度；旧读取程序拒绝不认识的必需事件，不会将其解释为完整研究。现有日志与报告保持原样。

## 迁移

1. 使用当前学术技能生成并审核新计划。可见问题保持简洁，机器可读计划包含获批方面及 `direct` 或 `quantitative` 要求。未经审核，不得为历史获批计划增加要求。
2. 升级所有读取新 Session 日志的程序，不要用旧写入程序继续新的覆盖核查运行。
3. 检查 Controller 配置中的 `coverageReviewMaximumCalls`、`coverageReviewMaxTokens`、`coverageReviewAttemptTimeoutMs`、`coverageReviewExcerptCharacters`、`coverageRepairMaximumRounds`、`coverageRepairMaximumPapers`、`coverageRepairMaximumNewWorks` 和 `coverageRepairMaximumCharacters`。输出上限包含推理 token，降低上限可能导致覆盖未核查。
4. 确认运行记录分方面缺口，并在补强额度耗尽时报告剩余缺口，不再以 `target_and_coverage_met` 停止。见[工作流](../../../../packages/academic/workflow/README.zh.md)。
