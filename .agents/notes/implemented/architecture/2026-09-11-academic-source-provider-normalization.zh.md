# Agent Note: 学术来源提供方规范化——arXiv

Status: implemented

[English](2026-09-11-academic-source-provider-normalization.md) | 中文

## 问题

学术来源 seam 要求每个 Provider 把自己的 wire 响应转换成相同的共享 `AcademicWork`/`WorkVersion` 对和规范化外部标识符。arXiv 通过 Atom XML 提供预印本记录，其中包含带版本的 arXiv id 和可选 DOI，摄取可以据此关联版本。

## 决策

`@deepseek-ai/dsh-academic-source-arxiv` 是注册进 `ctx.academicSource` 的独立包，包含规范化器、网络 Provider 和命名空间插件。它查询 `GET {base}/api/query?search_query=all:…&max_results=…`，并用 `fast-xml-parser` 解析 Atom feed。每条条目都是不记录期刊场所的预印本版本；成果级 `arxiv` 标识符剥掉主机与 `vN` 后缀，使所有版本以同一成果为键，而版本保留带后缀的记录 id、`vN` 标签与 Atom `updated` 日期。可选的 `arxiv:doi` 成为成果级 `doi` 标识符，因此摄取能把预印本与后续全文 Provider 发现的版本合并。

DOI 规范化按约定共享，而非通过辅助函数导入共享：每个提供方都小写为相同的裸形式，符合 `externalIdentifierDedupKey` 契约——调用方规范化的值是去重键。

## 包拓扑

```text
@deepseek-ai/dsh-academic-source  <--registers--  @deepseek-ai/dsh-academic-source-arxiv
        ctx.academicSource
                                                  (id: arxiv)
```

每个提供方只依赖 `dsh-academic-source` 与 `dsh-academic-model`；彼此互不导入。

## 曾考虑的替代方案

### 一个合并的多提供方包

否决。seam 的全部意义在于提供方可替换、可独立版本化，正如 OpenAlex 包已确立的那样；把 Crossref 与 arXiv 折叠进去会重新耦合它们的 wire 格式。

### 复用一个跨提供方的 DOI 规范化器

暂否决。规范化是每个提供方重复的一行小写折叠；为一个简单的规则新增包边界，而规范形式仍是「小写裸 DOI」，并不划算。当第三个提供方需要的不止 DOI 折叠时再重新考虑。

## 后果

**是标识符而非 wire 结构决定合并。** arXiv 贡献 `arxiv` id 加可选 DOI。摄取可以通过 DOI 去重键关联后续全文 Provider 的记录，因此折叠形式必须完全一致。

**arXiv 仅作预印本。** 它的版本类型与发表状态始终是 `preprint`；每次修订都可通过带后缀的 id 寻址，出版方版本由另一个提供方到达并借 DOI 合并。

**一个 XML 解析器依赖。** `fast-xml-parser` 是本提供方使用的唯一受维护解析器；它已在仓库依赖图中，因此不拥有新的原生或手写 XML 代码。

## 延后工作

- arXiv 基于 `start` 的 `max_results` 之外分页。
- 若第三个提供方需要的不止 DOI 折叠，则引入共享的标识符规范化辅助函数。

原始决策中的 Crossref 实现已由[纯元数据 Provider 移除决策](../simplification/2026-09-16-remove-metadata-only-academic-providers.zh.md)移除。
