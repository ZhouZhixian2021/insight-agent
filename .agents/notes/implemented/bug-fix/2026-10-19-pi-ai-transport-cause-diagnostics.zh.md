# Agent Note: 为运维诊断保留 pi-ai HTTP 传输底层原因

Status: implemented

[English](2026-10-19-pi-ai-transport-cause-diagnostics.md) | 中文

## Problem

pi-ai 在 Harness 适配层接收终态事件之前，就将捕获的 HTTP 异常压缩成一段消息。因此，学术候选审核可能连续数百次报告 `Connection error.`，却没有能够定位故障链路的 socket 或代理错误代码。现有 `TRANSPORT` 分类支持重试策略，但无法解释事故原因。

## Decision

pi-ai 适配层为每次模型调用注入独立的 HTTP fetch 包装器。请求建立失败时，包装器保留原始错误名称及其 `cause` 链中受限的 `code` 值；对于成功建立的事件流响应，也观察正文读取失败。收到响应时，它记录 HTTP 状态和通过字符限制的请求 ID。终态为 `TRANSPORT` 或 `TIMEOUT` 时，插件只记录一次调用级诊断，包含上述事实、路由、模型、失败代码和耗时。面向用户的 LLM 失败结果和重试分类保持不变。诊断不包含原始异常消息、URL、请求头、凭据或载荷。

## Alternatives considered

**仅根据压缩后的消息分类。** 未采用，因为 `Connection error.` 无法区分代理重置、上游 socket 关闭或其他 fetch 故障。

**把原始异常加入 Session 或 LLM 失败结果。** 未采用，因为原始原因可能带有端点信息，而且仅为运维需要就扩大持久化和用户可见的数据格式不合适。

**派生 pi-ai 并在所有提供方路径保留异常。** 暂缓，因为当前请求选项允许注入 HTTP fetch；本地钩子可覆盖正在使用的 OpenAI 兼容路由，而无需维护派生版本。

## Consequences

即使 pi-ai 压缩终态错误，HTTP 请求和事件流失败仍可保留机器可读的底层原因代码。不使用注入式 HTTP fetch 的提供方，以及流读取结束后的提供方解析失败，仍只有压缩消息。包装器不改变重试行为或学术工作流结果。
