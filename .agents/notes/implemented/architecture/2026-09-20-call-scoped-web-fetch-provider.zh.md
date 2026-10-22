# Agent Note: Academic 全文使用单次调用范围的 Web 抓取选择

Status: implemented

[English](2026-09-20-call-scoped-web-fetch-provider.md) | 中文

## 问题

部署可以选择会把 HTML 转换为可读文本或拒绝 PDF 的通用 Web 抓取 Provider。这种行为适合面向模型的网页抓取，但 Academic 证据准备需要有界的原始 HTML 或 PDF 字节。Academic Controller 此前通过 `ctx.web.fetch()` 调用部署默认值，因此安装 `dsh-web-tools` 会改变全文输入形状，让原本可解析的论文变成 `fulltext_unavailable`。

## 决策

`WebRuntime.fetch()` 在现有请求和取消参数之后接受可选的单次调用 `providerId`。该 id 使用既有的确定性 Provider 解析与错误词汇，并且不会修改部署默认值。

`AcademicResearchController` 暴露 `fulltextFetchProvider`，默认值为 `http`，Web 组合显式设置该字段。Academic 全文调用选择这个 Provider，普通 Web 抓取则继续使用部署已配置的 Provider。

## 考虑过的替代方案

**把全局 Web 抓取 Provider 改成 `http`。** 未采用，因为这会让无关 Web 消费者失去已安装的页面提取能力。

**在 Academic Controller 内构造 `HttpFetchProvider`。** 未采用，因为这会让 Controller 耦合到一种传输实现，并绕过共享 Web 注册表、取消与错误策略。

**增加自动能力协商。** 延期处理，因为当前消费者只有一项明确要求和一个已经验证的 Provider。可配置的单次调用选择能够解决已观察到的冲突，无需增加 Provider 排名或回退语义。

## 结果

不同消费者可以为一次调用选择已注册的抓取 Provider，而不改变其他消费者。Academic 全文获得其已有校验所需的原始 HTML/PDF 契约，部署也可以通过 Controller 配置替换 `http`。所选 Provider 缺失或不可用时，调用使用既有结构化 Web 选择错误失败，不会静默回退。
