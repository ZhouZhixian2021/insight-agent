---
description: "通过当前 Session 的 Playwright 浏览器操作已配置学术网站的搜索表单。"
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-browser

[English](README.md) | 中文

## 概述

此可选插件注册 Academic 检索 Provider `browser`。它填写已配置网站的搜索框、提交查询、读取官方论文页面，并归一化页面发布的引用元数据。全文候选来自 `citation_pdf_url`，Provider 不拼接下载网址。它也通过现有 Web 搜索服务提供这些记录。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在同一个 profile 中挂载 `dsh-academic-source`、`dsh-browser-use`、由 Session 持有的 Playwright 浏览器 Provider 和本插件。参考[三个站点的配置](examples/sites.json)填写 `sites`，明确选择会议和卷的网址。当前适配使用可选的 `dsh-experimental-browser-use-playwright-mcp` Provider 及其 `browser_run_code_unsafe` 工具，需要显式启用。本包不另行启动浏览器，也不需要出版商 API 凭据。

在 Academic 研究控制器设置 `webDiscoverySearchProvider: browser`，即可仅让正式论文的 Web 发现使用这些网站。Source runtime 和已批准计划的直接检索保留 OpenAlex／arXiv，计划同时启用 `academic` 和 `web_discovery`。普通 `web_search` 仍使用共享 Web Provider，包括计划预检及其他预设。结果包含官方链接、标题、可用的原摘要及覆盖范围；引用须经既有 ACL、PMLR、CVF、OpenAlex 或 arXiv Provider 核验后才进入证据获取。代理回合以外的调用需要 `agents.withInitiator()`；控制器会为维护操作建立该作用域。

本插件同时注册 fetch Provider `browser`。设置 Academic 控制器的 `fulltextFetchProvider: browser`，即可通过浏览器点击实际观察到的 PDF 链接，校验 PDF 字节，再交给既有证据解析器。其他来源的网址使用 `otherFetchProvider`（默认 `http`）；浏览器下载失败时不会切换传输方式。每次操作后都会清理临时下载；`maximumPdfBytes`（20000000）限制下载完成后可接受的文件大小，不限制传输量或临时磁盘占用。

每个站点配置搜索网址、覆盖范围、表单和结果选择器、论文网址表达式及允许的 PDF 来源。可选的 `resultUrlRewrite` 在网址校验前，将已知的出版商结果路径映射到官方详情页；ACL 示例将 PDF 搜索结果转为包含引用元数据的 HTML 页面。下载网址仍只取自页面发布的引用元数据。`mode: submit` 等待导航，`mode: filter` 使用站内过滤。就绪选择器需要时须包含明确的空结果提示。只读取第一页；可见的下一页控件标记结果截断。

可配置上限为 `maximumResults`（6）、`maximumCachedRecords`（1000）、`operationTimeoutMs`（15000）及 `maximumMetadataCharacters`（32000）。Source 检索和浏览器工具的超时需覆盖完整操作，包括访问论文详情页。任一站点失败会使此次 browser 检索失败，其他 Academic Provider 独立保留各自结果。请求数量超过 `maximumResults` 时会被限制；各配置站点轮流分享聚合结果配额。

<a id="understand-the-implementation"></a>
## 理解实现

插件通过当前 Agent 的既有 DSH 工具运行固定的浏览器操作。网页内容不会成为可执行代码。发布记录前会检查论文网址的同源限制、引用元数据、PDF 来源、结果数量和元数据大小。缺少 PDF 时保留元数据但不提供全文候选。元数据不受支持或访问失败时，检索会报错，不会编造论文或猜测链接。

Provider 在内存中保存实际观察到的 PDF 位置，供 `resolveFullText()` 使用。缓存已满时拒绝添加新记录，不淘汰已有候选。卸载会取消正在进行的操作，等待其结束，再清空这些位置。证据解析仍由 Academic evidence 负责。Chromium Download API 提供下载完成状态，不提供源站 HTTP 状态；本适配沿用既有 API fetch 适配器的约定，将已完成且通过 PDF 校验的获取结果表示为状态 200。

<a id="model-experience"></a>
## 模型体验

通过 Academic 工作流和现有 Web 工具间接生效：归一化的论文元数据、全文候选、覆盖范围限制和来源失败使用现有 Academic 结果类型，不添加工具 schema 或提示词段落。

#### KV 缓存影响

不直接使提示词缓存失效；检索证据的序列化由工作流负责。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- ACL 支持站内搜索；PMLR 仅过滤配置的卷；CVF 仅搜索配置的会议。
- 新站点需要实际可用的表单选择器、论文网址限制、PDF 来源和受支持的引用元数据。仅提供主页网址不够。
- 不绕过登录、验证码、付费或访问拦截。页面结构变化时需修改对应站点配置。
- PDF 位置不会跨插件卸载或进程重启保留。再次解析这些记录前需要重新检索。
- 当前适配要求 Playwright MCP 浏览器 Provider，其他 DSH 浏览器 Provider 不能直接替代它的工具协议。

<a id="dev-note"></a>
### 开发备注

不另行维护不变量说明；Provider 校验与卸载行为由所属测试检查。
