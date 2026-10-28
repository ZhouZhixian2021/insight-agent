---
kind: upgrade-guide
description: 学术筛选保留低分合格候选，并调整审核与范围补读的默认值。
---

# 学术筛选预算与优先级队列

[English](guide.md) | 中文

## 变更

Controller 新计划使用 `ACADEMIC_CANDIDATE_RANKING_POLICY_V2`：低于 50 分的候选进入 P2，不再直接排除。硬排除继续生效。V2 支持英文常规尾缀 s，缺少词项命中时保留为背景候选。V1 与已保存计划策略保持各自解释。

`candidateReviewMaximumWorks` 默认从 8 调整为 24。审核按配置分批进行；`candidateReviewGapReserve` 默认为 4，为缺口检索新发现的候选预留额度，第二轮起释放。`scopeReviewMaximumBatches` 默认为 3，不再只查看首个来源批次。这些默认值可能增加模型调用与全文处理量。范围仍无法判断时暂停。

## 迁移

1. 检查 `cordis.yml` 中 Academic Research Controller 的配置。设置 `candidateReviewMaximumWorks: 8` 保留原审核总额，设置 `candidateReviewGapReserve: 0` 不预留缺口额度，设置 `scopeReviewMaximumBatches: 1` 保留单批范围输入。
2. 需要原词项排除门槛的库调用方仍可传入 `ACADEMIC_CANDIDATE_RANKING_POLICY_V1`。恢复已有运行时读取已保存策略，不要重写 Session 记录。
3. 查看新研究运行的候选排序、审核选择和批次结算。确认低分合格论文进入 P2、实际审核调用不超过配置总额、明确排除继续生效。详见 [Controller 配置](../../../../packages/api/academic-research-controller/README.zh.md)。
