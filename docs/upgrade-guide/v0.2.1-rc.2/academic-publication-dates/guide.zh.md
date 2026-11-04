---
kind: upgrade-guide
description: "学术计划启动含歧义的旧日期窗口前，必须明确日期语义。"
---

# 学术论文日期

[English](guide.md) | 中文

## 变更

学术计划版本 6 明确日期上限语义与规则归属。上限为空不再允许模型自行推定当前日期。旧计划若上限为空且日期规则未分类，启动时需重新审核。历史计划、日志和报告仍可读取，且不会改写。新运行保存版本化的日期上下文事件；旧读取器会安全拒绝未知事件，避免错误解释。

## 迁移

1. 请学术洞察按[当前 Brief 模板](../../../../packages/academic/bundle/presets/academic/skills/academic-insight-report/references/research-brief.md)修订计划。
2. 选择 `publicationDatePolicy.endMode`：`fixed` 必须填写 `publicationWindow.end`，`run_start` 和 `unbounded` 必须使用空上限。设置认可的 IANA `timeZone`，在 `inclusionRuleKinds` 和 `exclusionRuleKinds` 中逐项标记 `content` 或 `publication_date`，拆分混合规则。
3. 审核并批准修订计划，再启动新研究。在报告检索说明中检查日期窗口、日期口径、时区与原始开始时间。恢复运行继续沿用原先保存的截止日。
