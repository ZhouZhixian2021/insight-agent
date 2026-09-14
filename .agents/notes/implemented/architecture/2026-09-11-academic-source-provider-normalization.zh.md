# Agent Note: 学术来源提供方规范化——Crossref 与 arXiv

Status: implemented

[English](2026-09-11-academic-source-provider-normalization.md) | 中文

## 问题

学术来源 seam 需要多个提供方，才能证明其词汇是 provider 中立的。Crossref 与 arXiv 在 wire 格式上与 OpenAlex 不同（Crossref 是 JSON，arXiv 是 Atom XML），并且每条记录所代表的内容也不同：Crossref 索引正式出版的作品，arXiv 托管预印本。它们必须产出相同的共享 `AcademicWork`/`WorkVersion` 对，并且——关键在于——产出相同的规范化外部标识符，否则摄取无法跨提供方合并同一成果的记录。

## 决策

两个提供方都是注册进 `ctx.academicSource` 的独立包，镜像 OpenAlex 提供方的结构（规范化器 + 网络提供方 + 命名空间插件）。它们只是在 wire 映射上不同：

1. `@deepseek-ai/dsh-academic-source-crossref` 查询 `GET {base}/works?query=…&rows=…`，并规范化每条 `message.items[]` 项。它唯一的外部标识符是 DOI，折叠为小写裸形式，从而与 OpenAlex、arXiv 的 DOI 键规范化对齐。Crossref `type` 映射到发表状态：`posted-content` → 预印本，元数据类型 → 已发表，其余 → 未知。
2. `@deepseek-ai/dsh-academic-source-arxiv` 查询 `GET {base}/api/query?search_query=all:…&max_results=…`，并用 `fast-xml-parser` 解析 Atom feed。每条条目都是不记录期刊场所的预印本版本；它的 `arxiv` 标识符剥掉主机与 `vN` 后缀，使同一论文的所有版本以相同方式作为键，而可选的 `arxiv:doi` 成为 `doi` 标识符，因此摄取能把预印本与出版方版本合并。

DOI 规范化按约定共享，而非通过辅助函数导入共享：每个提供方都小写为相同的裸形式，符合 `externalIdentifierDedupKey` 契约——调用方规范化的值是去重键。

## 包拓扑

```text
@deepseek-ai/dsh-academic-source  <--registers--  @deepseek-ai/dsh-academic-source-crossref
        ctx.academicSource                         (id: crossref)
                                 <--registers--  @deepseek-ai/dsh-academic-source-arxiv
                                                  (id: arxiv)
```

每个提供方只依赖 `dsh-academic-source` 与 `dsh-academic-model`；彼此互不导入。

## 曾考虑的替代方案

### 一个合并的多提供方包

否决。seam 的全部意义在于提供方可替换、可独立版本化，正如 OpenAlex 包已确立的那样；把 Crossref 与 arXiv 折叠进去会重新耦合它们的 wire 格式。

### 复用一个跨提供方的 DOI 规范化器

暂否决。规范化是每个提供方重复的一行小写折叠；为一个简单的规则新增包边界，而规范形式仍是「小写裸 DOI」，并不划算。当第三个提供方需要的不止 DOI 折叠时再重新考虑。

## 后果

**是标识符而非 wire 结构决定合并。** Crossref 只贡献 DOI；arXiv 贡献 `arxiv` id 加可选 DOI。摄取通过 DOI 去重键跨提供方关联记录，因此折叠形式必须完全一致。

**arXiv 仅作预印本。** 它的版本类型与发表状态始终是 `preprint`；出版方版本由另一个提供方到达并借 DOI 合并。

**一个 XML 解析器依赖。** `fast-xml-parser` 是本提供方使用的唯一受维护解析器；它已在仓库依赖图中，因此不拥有新的原生或手写 XML 代码。

## 延后工作

- 通过 `update-to` 链接的 Crossref 撤回检测。
- arXiv 基于 `start` 的 `max_results` 之外分页。
- 若第三个提供方需要的不止 DOI 折叠，则引入共享的标识符规范化辅助函数。
