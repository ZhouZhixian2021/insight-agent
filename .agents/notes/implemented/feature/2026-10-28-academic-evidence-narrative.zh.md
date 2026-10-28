# Agent Note: 证据叙述式报告交付

Status: implemented

[English](2026-10-28-academic-evidence-narrative.md) | 中文

## Problem

方向层级会把小型比较扩展为大量标题和段落跳转。固定材料实验将 C 写作变化与慢检索及上游证据波动区分。

## Decision

新综合提示选择 B 式问题导向正文、章节分工和简短引用，借鉴 PaperQA、STORM 与 GPT Researcher 的写作原则。保留批准输入、现有陈述／引用校验、Claim 构建及一次既有综合阶段。analysis 自有可选标记 writingStyle: evidence_narrative 选择新渲染器，不增加共享 Academic Model 或 Controller 字段。

渲染器仅展开一次陈述，省略重复位置，在表格直接展示实际结果和条件，将范围与不确定性保留在论述旁。范围及逐题核对位于正文之后，完整摘录和身份保留在附录。证据准入、独立研究检查、合成材料限制及交付判断不变。未标记的历史草稿保留原布局。

私有固定材料工具导出并重放 C 输入，记录准确来源，明确区分最初撰写示例与两次真实 DeepSeek 调用。两种真实处理使用同样 40 条证据、模型入口和设置；引用选择是输出。未知模型引用被隔离，不猜测修复。私有 Session、原始模型输出和报告文件不进入 Git。

## Alternatives considered

仅修改 HTML 样式不能解决报告结构过重。替换成完整上游 Python 项目会改变来源与工作流归属。新增多轮摘要或润色调用增加耗时，采用的写作指令复用既有综合调用。手工修正模型引用会掩盖实验失败。

## Consequences

本决定部分取代[方向报告说明](../architecture/2026-10-12-academic-direction-report.zh.md)中的默认写作方式；其历史解析、方向检查与书目继续受支持。模块内叙述快照和 SDK 请求快照覆盖新提示及输出。两份真实样本证明可执行对比，不证明统计优势或独立语义审核通过。浏览器视觉与打印验收尚未完成。聊天区接入和连续研究不在本轮范围。
