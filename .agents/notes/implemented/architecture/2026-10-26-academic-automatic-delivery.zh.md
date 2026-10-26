# Agent Note: 学术报告自动交付

Status: implemented

[English](2026-10-26-academic-automatic-delivery.md) | 中文

## Problem

工作流固定请求草稿，问题驱动报告不论证据质量都拒绝正式输出。缺少独立审核、逐题缺口与程序检查失败混在一起。

## Decision

工作流请求 auto 交付。证据准入、引用、版本、哈希、摘录、等级、独立论文数量、计划批准、置信度和冲突披露检查继续执行。必要结构及非合成数据决定交付。报告不限制字数，历史 targetLength 不影响交付，新计划填写空上下限。分析提示明确不为字数要求填充或截断内容。缺少独立审核及单篇陈述语义审核不再是前置条件；已提供但无效或不支持结论的审核仍阻止交付。逐题关联和模型提出的部分回答作为不阻止交付的内容提示。不增加模型调用，ready 不表示语义审核通过。

问题通过已有 Remote 携带可选 delivery/content 分类。Markdown、主页面和 HTML 导出分别展示交付阻碍与内容限制。历史报告保留原状态和缺失分类。显式 final 拒绝未通过检查的报告，调用方仍可选择草稿。

## Alternatives considered

删除全部检查会允许无效引用和合成数据进入正式报告。新增模型裁判会增加耗时，不属于本轮范围。仅修改页面名称会歪曲已保存结果。

## Consequences

本文部分取代[报告最小闭环](2026-09-14-academic-report-slice.zh.md)、[问题驱动分析](2026-09-20-academic-question-synthesis.zh.md)和[最小证据报告](2026-10-15-academic-minimal-report-review.zh.md)中的强制审核交付规则，其证据与分析决定仍有效。测试覆盖无审核交付、逐题缺口不阻止交付、保留完整性与数量失败并忽略历史字数上下限及页面分类。历史 Session 报告不重写。
