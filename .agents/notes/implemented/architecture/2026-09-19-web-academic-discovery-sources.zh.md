# Agent Note: Web Academic 发现使用 OpenAlex 与 arXiv

Status: implemented

[English](2026-09-19-web-academic-discovery-sources.md) | 中文

## 问题

Web Academic 组合原先注册 arXiv 与三个会议目录 Provider；来源运行时未配置发现列表时，会搜索每个可用 Provider。这些会议目录覆盖配置的 2025 年页面，不是通用历史语料库，其失败也会干扰判断一次有界研究运行能否发现获批的 2017—2020 年论文。已经合并的 OpenAlex Provider 尚未由 Web 组合挂载，因此其发现结果无法进入工作流。

## 决策

正式 Web 组合挂载 OpenAlex Provider，并把 `searchProviders` 配置为 `openalex` 与 `arxiv`，每个 Provider 的搜索时限为 25000 ms。面向 `search()` 调用方的单来源 `searchProvider` 继续使用 `arxiv`。

ACL Anthology、CVF 与 PMLR 继续挂载，因为它们登记的记录能够解析已知全文地址；它们不属于 Web 发现列表。OpenAlex 不设置发表年份过滤：其聚合发表日期不能确立 `first_public_release`，严格日期资格仍需权威来源。每个 Provider 都接收未修改的原查询且不做规划；[有界传输重试决策](../bug-fix/2026-09-20-academic-source-transient-transport-retries.zh.md)允许 arXiv 与 OpenAlex 仅重复临时传输尝试。

Web 组合把内置 `web-fetch-http` Provider 配置为 120000 ms 超时、5000000 字节响应上限和 1000000 字符解码正文上限。Academic 证据准备会拒绝截断的 HTML 与不完整 PDF，而两篇固定验收论文都超过该 Provider 原先的 100000 字符默认值。面向模型的 Web 工具继续保留自身更短的调用预算。

## 考虑过的替代方案

**只使用 OpenAlex。** 未采用，因为 OpenAlex 有意把 `first_public_release` 保持为未知；即使发现成功，严格首发日期窗口仍可能排除所有仅来自 OpenAlex 的候选。

**只使用 arXiv。** 未采用，因为这会放弃 OpenAlex 更广的发现范围与出版方位置元数据。

**搜索每个已注册 Provider。** 未采用，因为已配置的会议目录是有界目录解析器，不是完整历史检索语料库；让它们参与会使实际来源覆盖取决于无关目录页。

**从 Web 删除会议 Provider。** 未采用，因为它们仍能为标识这些 Provider 的记录解析全文地址；选择发现来源不要求移除解析器注册。

## 结果

Web Academic 运行把 `arxiv` 与 `openalex` 报告为实际发现来源，以配置时限隔离每个 Provider，并为已知记录保留会议全文解析器。某个 Provider 失败时仍可形成部分成功批次。

发现成功不保证获批论文能够通过单查询聚合上限、跨查询候选上限、元数据资格和全文选择。固定 Transformer 与 BERT 验收因此继续区分接线成功与研究内容通过，并把查询规划保留为独立决策。

后加载的 Profile 或插件可以选择另一个默认 `ctx.web.fetch` Provider。把 HTML 转成纯文本或拒绝 PDF 的 Provider 虽然实现通用 Web fetch 接口，却不满足 Academic 证据准备对原始 HTML/PDF 的要求。Academic 明确选择全文 Provider 的接口仍待后续确认；使用当前 Controller 的部署必须为 Academic 全文获取选用内置 `http` Provider。
