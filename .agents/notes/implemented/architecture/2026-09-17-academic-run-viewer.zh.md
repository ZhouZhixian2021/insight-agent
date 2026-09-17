# Agent Note：固定数据学术运行页面

状态：已实现

[English](2026-09-17-academic-run-viewer.md) | 中文

## 问题

Academic Remote 尚未提供 A 交接约定的 retrievalRun。请求完成、检索成功和报告审核描述不同事实；只有报告的页面无法呈现部分失败和覆盖限制。

## 决策

[客户端插件](../../../../packages/client/ui-academic-research/README.zh.md)在 sidebar.footer.action 注册明确标注合成数据的样例入口。局部 RunValue 组合既有 Remote 结果和共享 RetrievalRun，不修改生产方类型。源码夹具复制交接文件的 expectedValue，一致性测试检测漂移。

面板接收调用方提供的视图数据和取消回调。样例入口仅切换本地固定场景，不调用 Remote、不模拟进度计时器、不调用模型。运行中只展示等待和取消；返回后分别展示生命周期、检索状态和报告质量，直接读取覆盖统计，分别保留来源和论文处理失败，并在取消后保留已返回成果但不展示报告。providerBreakdown 为 null 时显示未提供。

## 考虑过的替代方案

调用当前 Remote 后从 papers 补算覆盖统计会虚构来源事实。由 C 修改 Controller 类型会越过生产方职责。两者均留给 A 集成；正式结果符合交接结构后可移除局部适配。

## 影响

样例页面不提供 Session 持久化、服务器取消或语义审核操作。原独立报告渲染器仍为内部工具。[先前报告基线](2026-09-14-academic-report-slice.zh.md)继续负责分析和评测语义；本决策补充 Web slot 和运行结果展示。

## 验证

模块测试覆盖交接一致性、状态分离、空数据与不完整证据、安全文字、筛选、原文 Markdown 下载及插件卸载。无密钥浏览器测试启动实际 Web Loader 组合，操作真实侧栏入口、证据及样例取消。Controller 生成的校验代码运行时需要 zod；补齐遗漏依赖，不改变 Controller 类型或业务行为。
