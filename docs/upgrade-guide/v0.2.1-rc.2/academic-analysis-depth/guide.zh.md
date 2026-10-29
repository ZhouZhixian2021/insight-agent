---
kind: upgrade-guide
description: 学术分析取消固定条目上限，保留模型响应预算和证据校验。
---

# 学术分析深度与数量常量移除

[English](guide.md) | 中文

## 变更

academic-analysis 包不再导出 `MAX_SYNTHESIS_STATEMENTS`、`MAX_SYNTHESIS_STATEMENTS_PER_QUESTION` 和 `MAX_SYNTHESIS_EVIDENCE_LINKS`。解析器允许更充分的有证据分析，不设置固定条目数上限。提示要求在配置的完整响应 Token 预算内解释技术内容。证据校验和工作流有限恢复继续有效；本次不增加模型输出配置或请求次数。

## 迁移

1. 删除对这三个数量常量的导入。通过问题覆盖与证据判断完整性，不再以固定条目数推断。
2. 保留消费工作流的模型 Token 预算、取消与有限重试。达到输出上限而停止的响应仍不完整，不能作为完整报告解析。
3. 使用固定材料比较技术内容与 Token 消耗。已有草稿继续可读，新提示仅用于新模型请求。
