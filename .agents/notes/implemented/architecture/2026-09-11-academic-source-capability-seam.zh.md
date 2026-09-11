# Agent Note: 学术来源能力 seam——跨学术提供方的单一提供方注册表

Status: implemented

[English](2026-09-11-academic-source-capability-seam.md) | 中文

## 问题

学术洞察需要触达多个学术提供方（OpenAlex、Crossref、arXiv，以及后续的 Semantic Scholar、PubMed），而这些提供方的原始响应结构各不相同。工作流或分析消费方必须面向**一个** provider 中立的「搜索学术成果」操作编程，而不是面向每家厂商的 API。把面向模型或面向工作流的契约绑定到某一家厂商，会把该厂商的影子带进每一个下游包；而让每个提供方各自注册自己的操作，又会把 provider 特有的字段泄漏进共享契约。

此外还有提供方选择的问题。`inject: ['academicSource']` 只证明服务存在，不能证明存在可用的来源提供方，也不能在注册了多个提供方时决定由谁胜出。[web seam](2026-06-24-web-capability-seam.zh.md) 为 `search`/`fetch` 构建的同一套选择机制同样适用于此处的 `search`。

## 决策

学术来源是一个遵循[能力 seam Agent Note](2026-06-13-capability-seams.zh.md) 的能力 seam：

1. `@deepseek-ai/dsh-academic-source`（`packages/academic/source`）拥有 `ctx.academicSource`、提供方注册、提供方选择、共享的请求/结果词汇，以及 `AcademicSourceError` 分类体系。
2. 提供方包实现具体后端并向 `ctx.academicSource` 注册能力，在自己的包边界把记录转换成共享的 `AcademicWork`/`WorkVersion` 模型。`dsh-academic-source-openalex` 是第一个提供方：它搜索公开的 `/works` 端点并规范化每条记录，因此 OpenAlex 专有字段名不会离开该包。
3. 面向模型的消费方（工具，或工作流/检索增量）稍后到来。这第一个切片只交付 Service Definition；在有提供方注册之前，每次 `search()` 都以 `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE` 失败。

该 seam 在 v1 仅支持搜索。请求携带 `query` 与可选 `maxResults`；结果是 `works[]`，每一项是一对 `{ academicWork, workVersion }`，外加一个 `truncated` 标记。跨记录版本关联、去重与运行/覆盖统计属于后续增量：共享模型尚未发布 `RetrievalRun`、`CoverageSummary`、`ProviderFailure` 与 `BatchResult`，因此 seam 仅通过 `AcademicSourceError` 呈现失败。

## 包拓扑

```text
@deepseek-ai/dsh-academic-model   <--depends on--   @deepseek-ai/dsh-academic-source
      shared records                                interface (ctx.academicSource)
                                                     ^
                                                     | registers normalized works
                             @deepseek-ai/dsh-academic-source-openalex (provider)
```

Service Definition 只依赖 `dsh-academic-model`、Cordis 与 schemastery（用于 `Config`）。它不导入工具、agent、会话、LLM 或提供方包。提供方依赖 `dsh-academic-source` 与 `dsh-academic-model`；只有 `dsh-academic-source` 拥有 `ctx.academicSource` 键。

## `ctx.academicSource` 契约

权威签名位于 `packages/academic/source/src/types.ts`；seam 的结构：

```ts
import type { AcademicSourceSearchRequest, AcademicSourceSearchResult } from '@deepseek-ai/dsh-academic-source'

interface AcademicSourceProvider {
  readonly id: string
  available(): boolean
  search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult>
}

interface AcademicSourceRuntime {
  registerSearchProvider(provider: AcademicSourceProvider): () => void
  search(request: AcademicSourceSearchRequest, signal?: AbortSignal): Promise<AcademicSourceSearchResult>
}
```

可选的 `signal` 是执行控制，不是业务输入：未来的消费方会传入自己的执行信号，使回合取消、超时与 agent 销毁能传达到提供方的网络请求。提供方 id 是稳定字符串；重复 id 抛出 `ACADEMIC_SOURCE_DUPLICATE_PROVIDER`。注册返回一个 disposer，并封装在 `ctx.effect()` 中，随贡献 fiber 一起拆除。

## 提供方可用性与选择

提供方的 `available(): boolean` 是廉价的本地检查（凭证是否存在、配置是否可解析），禁止发起网络调用。选择在每次调用时派生，从不依赖注册顺序、配置顺序或 HMR 顺序：

| 情况 | 执行行为 |
|---|---|
| 配置的提供方 id 已注册且 `available() === true` | 运行该提供方 |
| 配置的提供方 id 未注册 | `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING` |
| 配置的提供方 id 已注册但不可用 | `ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE` |
| 未配置 id 且恰好一个已注册可用提供方 | 运行该唯一提供方 |
| 未配置 id 且无可用提供方 | `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE` |
| 未配置 id 且多个可用提供方 | `ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS` |

`searchProvider` 配置字段固定一个提供方；`$DSH_ACADEMIC_SOURCE_SEARCH_PROVIDER` 填充同一字段，不是隐藏的优先级链。`maxResults` 从消费方流向 seam 再流向提供方，seam 在返回时通过截断 `works[]` 并设置 `truncated` 强制执行上限。

## 错误

`AcademicSourceError` 携带稳定、开放式的 `code` 与链式 `cause`。它有意重新实现 `HarnessError` 结构，而不是继承 `@deepseek-ai/dsh-llm` 的基类，使学术业务组保持独立于 LLM 能力包；消费方按 `code` 路由，而非原型链。与 seam 无关的错误代码包括 `ACADEMIC_SOURCE_PROVIDER_UNAVAILABLE`、`ACADEMIC_SOURCE_PROVIDER_CONFIGURED_MISSING`、`ACADEMIC_SOURCE_PROVIDER_CONFIGURED_UNAVAILABLE`、`ACADEMIC_SOURCE_PROVIDER_AMBIGUOUS`、`ACADEMIC_SOURCE_DUPLICATE_PROVIDER` 与 `ACADEMIC_SOURCE_PROVIDER_ERROR`。

## 曾考虑的替代方案

### 把提供方分发放进未来的消费方工具

否决。工具/工作流包将同时拥有提供方选择、凭证、请求映射、传输与规范化，把面向模型的 schema 一次性耦合到每一家厂商。Service Definition 使选择与提供方契约拥有独立于消费方渲染方式的所有者。

### 让每个提供方注册自己的操作

否决。提供方包将拥有共享词汇，并迫使下游包学习后端细节。提供方注册的是能力，不是工具。

### 只从 OpenAlex 提供方派生结果结构

否决。seam 在共享模型之上携带 provider 中立的 `AcademicSourceWork` 对，因此 Crossref 与 arXiv 提供方无需修改 seam 或下游包即可返回相同结构。`dsh-academic-source-openalex` 的转换恰好与该结构一致，但并不定义它。

### 从 `@deepseek-ai/dsh-llm` 继承 `HarnessError`

针对学术组否决。web/filesystem seam 继承了它，但这些 seam 位于通用 harness 层；学术组是一个自包含的垂直切片，其最底层（`dsh-academic-model`）只依赖共享工具。重新实现 `{ name, code, cause }` 结构既保留了这一边界，又能在未来消费方映射时保持路由兼容。

## 后果

**搜索 schema 有意设计得很薄。** 只有 `query` 加 `maxResults`；provider 中立的过滤（`publicationWindow`、成果类型）须在一个有驱动的消费方与多个提供方能诚实支持时才加入。

**尚无可用的运行统计或覆盖报告。** 在共享模型发布这些记录之前，seam 无法记录 `RetrievalRun` 或 `CoverageSummary`；失败仅以 `AcademicSourceError` 形式呈现。

**尚无面向模型的工具。** 在消费方交付之前，没有任何东西注册提示词或 schema；该能力只能通过 `ctx.academicSource.search()` 触达。

**成果是单版本的。** 每个结果项都是一个全新的成果身份加一个不可变版本；跨记录关联与去重仍是摄取的职责，因此在摄取增量落地前，提供方对重叠记录集的搜索会返回互不相同的身份。

## 延后工作

- `query`/`maxResults` 之外的 provider 中立过滤。
- 按标识符抓取操作（按 DOI 或提供方 id 定位单一成果）。
- 面向模型的消费方（工具或工作流），负责渲染规范化成果并在工具边界映射 `AcademicSourceError`。
