# Agent Note: 学术来源 Provider 有界重试临时传输失败

Status: implemented

[English](2026-09-20-academic-source-transient-transport-retries.md) | 中文

## 问题

公开的 arXiv 与 OpenAlex 端点可能在一次连接失败或一次请求超时后，用同一条未修改查询再次调用便成功。来源轮次已经能够保留其他 Provider 的结果，但精确论文运行仍可能丢失日期资格和全文解析所需的权威记录。未配置代理策略时，普通 `fetch` 与内置 HTTP fetch Provider 都会遇到相同的 arXiv 连接超时，因此改走另一条能力调用路径不能消除这种临时失败。

## 决策

arXiv 与 OpenAlex Provider 暴露 `maxAttempts` 和 `retryDelayMs`。两者默认都只尝试一次；Web 组合显式选择两次尝试。arXiv 只重试尚未收到 HTTP 响应时发生的失败。OpenAlex 重试网络失败和自身的单次尝试超时。每次尝试都发送调用方提供的同一条查询。

HTTP 响应、限流、解析失败和调用方取消对该次 Provider 调用仍是终止结果。Academic 来源运行时保留单 Provider 时限、部分成功批次和取消行为；重试不能越过外层时限。

## 考虑过的替代方案

**在 Academic 来源运行时中重试。** 未采用，因为服务需要理解 Provider 专用的重试分类，并会改变所有 Provider 的执行策略。传输恢复继续归能够分类失败的 Provider 所有。

**通过通用 Web fetch 能力发送搜索。** 未采用，因为内置 HTTP Provider 复现了相同的 arXiv 连接超时；选择通用 fetch Provider 还会让学术 API 解析依赖部署的页面抓取选择。

**重试每个失败响应。** 未采用，因为限流、异常响应和 HTTP 错误需要来源专用处理，不能自动重复请求。

## 结果

正式 Web 组合可以在不生成新查询、也不隐藏最终失败记录的情况下，恢复一次临时 arXiv 或 OpenAlex 传输失败。重试会增加有界延迟；端点持续不可达时，失败仍进入现有部分成功结果。工作流改为说明 Provider 可能重复传输尝试，不再声称每条查询始终只发送一次请求。
