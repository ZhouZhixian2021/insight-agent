# Agent Note：基于真实会话的学术运行页面

Status: implemented

[English](2026-09-17-academic-run-viewer.md) | 中文

## 问题

请求结束、检索成功和报告审核通过是不同事实。Web 入口必须展示正式 AcademicResearchRunValue，不伪造进度，也不混用不同会话的结果。

## 决策

[客户端插件](../../../../packages/client/ui-academic-research/README.zh.md)在 sidebar.footer.action 注册研究表单。框架 useSessions 选择器提供当前已保存会话。表单通过注入回调提交去除首尾空格的查询、synthetic: false 和 AbortSignal；[Remote 集合](../../../../packages/api/remotes/README.zh.md)挂载生成的 Academic 贡献。Controller 负责已审核 Brief 与模型前置条件。多行输入框保留 query 内部换行，提示最多三条查询及已批准计划限制；拆分与限额校验归服务器负责。覆盖文案包含提前终止或检索受限，不将所有截断归因为数量上限。

每个已挂载的会话表单拥有一个 AbortController。running、error、settled 视图由请求结算驱动。关闭、切换会话或卸载会中止操作，请求身份阻止卸载后的迟到更新。用户取消时中止传输并等待结算；收到最终值则保留返回事实，取消后未收到值则明确提示缺少服务器结果，不伪造报告。样例与场景派生仅保留在测试中。

结果页分别展示运行、检索和质量状态，直接读取覆盖统计，区分来源失败与论文失败。providerBreakdown 为 null 时明确提示不可用。证据导航、搜索与 Markdown 下载消费返回报告。

## 考虑过的替代方案

与 RetrievalRun 临时取交集会重复正式结果已有的字段。生产入口的场景选择器会用虚构结果代替真实运行。将 abort 当作服务器完成会宣称传输尚未返回的事实。

## 影响

结果只保留在组件内，关闭或切换会话后清除。入口不提供进度流、自动重试、恢复或审核操作。[报告基线](2026-09-14-academic-report-slice.zh.md)继续负责分析和评测语义。

## 验证

模块测试覆盖返回结果、结构化错误、取消、重复提交、关闭、会话切换与迟到结算。无密钥浏览器测试启动实际 Web 组合，创建真实会话，经 Remote 验证 Controller 的前置条件错误，不调用模型。该测试验证传输接入，不代表真实来源的完整研究基准。
