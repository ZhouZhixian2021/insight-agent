# Agent Note：Academic 计划区分逐篇准入与文献组合覆盖

Status: implemented

[English](2026-10-10-academic-plan-rule-granularity.md) | 中文

## Problem

Academic 工作流会对每篇候选论文分别应用已批准的全部 `inclusionRule` 和 `exclusionRule`。计划模型此前可能把“至少纳入一篇指定基准论文”或“覆盖多个领域”等文献组合目标写入 `inclusionRules`。这样，一篇能够回答某个研究问题的相关论文，会因为无法独自满足整组文献的覆盖目标而被排除。一次真实 Q7 运行已经进入全文处理，却因此没有纳入任何论文。

## Decision

Academic 计划提示把 `inclusionRules` 和 `exclusionRules` 定义为逐篇条件。每条规则必须能根据一篇候选论文及其已核验来源独立判断，每篇纳入论文都必须满足适用规则。基准、领域、方法和研究类型等文献组合覆盖目标放入研究问题及关联检索方向。论文数量表达文献集合规模，未满足的组合目标通过覆盖缺口和报告限制披露。

结构化计划 schema 和运行期筛选语义保持不变。工作流继续要求论文满足所有逐篇纳入条件，不通过放宽已批准准入要求解决问题。随附模板在可读提纲、系统填写说明和 JSON 占位值中明确该边界；Academic skill 在计划入口重复这一规则。

## Alternatives considered

**立即增加公共 `portfolioRequirements` 字段。** 已否决，因为研究问题、关联检索方向、证据数量和覆盖缺口已经承载第一版所需行为。在尚无消费方需要类型化组合评估前，新字段会提前引入 Model、Controller、Session、Web 和兼容性迁移。

**把满足部分 `inclusionRules` 视为合格。** 已否决，因为这会改变已经批准的准入语义，并可能纳入违反真实逐篇条件的论文。

**在运行期通过多语言关键词识别组合目标并拒绝计划。** 已否决，因为自然语言分类容易误判不同主题和语言。编写提示、人工计划审核和确定性模板回归能够建立这一边界，无需增加不可靠的校验器。

## Consequences

- 新计划不会再要求每篇论文独自满足整组证据的覆盖目标。
- 因为没有改变公共 schema 或运行事件，既有已批准计划和已保存 Session 仍可读取。
- 计划模型仍可能写出不合适的规则；可读计划会向审核者展示这一区分，未来确需运行期组合评估时仍可增加类型化要求。
- 无密钥快照和聚焦模板测试会检测计划规则被删除或意外弱化。

## Testing

`packages/api/academic-research-controller/tests/plan-validation.spec.ts` 在保留兼容性验证的同时，检查逐篇占位值和组合目标指导。`academic-plan-chinese` 录制 Session 快照固定完整组装后的模型提示，不需要模型密钥。
