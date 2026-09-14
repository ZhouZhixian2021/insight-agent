# Agent Note: 学术证据——抓取全文与确定性构造

Status: implemented

[English](2026-09-11-academic-evidence-construction.md) | 中文

## 问题

共享模型以类型的形式定义了 `EvidenceRecord`、`EvidenceCard` 与六种 `SourceLocator` 变体，但没有表达两项约束：记录必须引用同一成果版本的定位，且证据等级约束其定位类型（`metadata` 引用提供方记录、`abstract` 引用摘要中的字符区间、`fulltext` 引用页码、段落、表格或图）。直接构造可以违反任一关联，而不检查论文内容就接受生成片段，会产生看似可追溯但来源并不包含的引文。

Academic 工作流拥有网络与模型路由以及持久请求记录，证据包拥有全文准备与单篇论文抽取策略。原始 `ctx.web.fetch()` 结果不能证明页面是完整的学术全文，也不携带段落定位或内容哈希。因此，证据操作需要接收与模型无关的输入，而不能自行调用 `ctx.web`、调用 `ctx.llm` 或写入 Session 事件。

## 决策

`@deepseek-ai/dsh-academic-evidence`（`packages/academic/evidence`）是一个纯库。它拥有确定性构造与单篇论文抽取操作；调用方提供语义生成器。

1. `createSourceLocator(input)` 构造六种定位变体之一，铸造 `sourceLocatorId`、固定 `schemaVersion: 1`、把 `contentHash`、`printedPage`、`sectionTitle`、`title` 与 `pdfPage` 缺省为 `null`，并拒绝负数字符区间、页码或段落号以及反向字符区间。
2. `createEvidenceRecord(input)` 铸造 `evidenceId`，要求记录与定位指向相同 `workVersionId`，强制等级-定位配对，并拒绝空的 `sourcedStatement`、`sourceProvider`、`sourceUrl` 与 `retrievedAt`。记录通过 `sourceLocatorId` 引用调用方构造的定位。
3. `createEvidenceCard(input)` 铸造 `evidenceCardId` 以及六个分区中每个条目的 `evidenceCardItemId`，拒绝空条目陈述；非空 `evidenceIds` 元组已由共享类型强制。
4. `prepareFetchedAcademicFullText(input)` 只接受未截断的 2xx 语义化 HTML；它移除非内容与隐藏块，推导带章节的段落定位，使用最终 URL，并哈希规范化文章。
5. `prepareFetchedAcademicPdf(input, signal)` 只接受未截断的 2xx PDF 字节，用 PDF.js 把每个有文本的页面提取成 `page_section` 片段，并哈希准确字节。无效、加密、扫描/无文本或其他不可解析 PDF 会失败，而不会被标记为全文。
6. `fetchAcademicFullText(input, fetcher, signal)` 按顺序尝试调用方提供的候选 URL（通常 HTML 优先、PDF 回退），返回第一个确认的全文。调用方适配 `ctx.web.fetch()`，因此 Provider 选择与网络策略仍由工作流拥有。
7. `extractEvidenceFromContent(input, generator, signal)` 把抽取指令、关注问题与可定位的摘要/全文片段交给生成器。它核对每段返回引文是原文的逐字子串，推导定位，使用可用片段与哈希构造证据记录，并把草稿条目归入一张 `EvidenceCard`。生成前后都会检查取消信号。

校验失败抛出 `EvidenceError`（重新实现 `HarnessError` 结构，无跨包基类），携带稳定代码。全文准备使用 `EVIDENCE_FETCH_STATUS`、`EVIDENCE_FETCH_TRUNCATED`、`EVIDENCE_FETCH_BODY_UNSUPPORTED`、`EVIDENCE_FULLTEXT_UNCONFIRMED` 与 `EVIDENCE_PDF_PARSE_FAILED`；构造和抽取保留现有代码。

## 等级-定位配对

| 等级 | 定位类型 |
|---|---|
| `metadata` | `provider_record` |
| `abstract` | `abstract` |
| `fulltext` | `page_section` \| `paragraph` \| `table` \| `figure` |

这是模型封闭联合类型无法承载的唯一边界内不变量，因此在构造时于此强制，而非信任。

## 包拓扑

```text
@deepseek-ai/dsh-academic-model  <--depends on--  @deepseek-ai/dsh-academic-evidence
      shared records + ids                        library (HTML/PDF preparation + extraction + construction)
```

证据依赖共享模型、Node 的 SHA-256 实现，以及用于确定性 PDF 文本提取的 PDF.js。它不定义 Cordis 服务，也不定义提供方。`AcademicWebFetchResult` 在结构上匹配 `WebFetchResult` 中使用的字段，因此调用方可以传入 `ctx.web.fetch()` 输出，而不把本库耦合到 web 服务包。调用方提供的抓取与生成适配器保留工作流对 web/模型路由的所有权。

## 曾考虑的替代方案

### 把构造并入共享模型

否决。模型拥有词汇与纯辅助函数，不拥有特定领域的生产；`createEvidenceRecord` 的等级-定位规则是证据模块的策略，会把模型耦合到 B 的抽取决策。

### 仅用 TypeScript 校验

否决。等级-定位配对跨越两个独立类型的字段；仅编译期保证需要把每个等级重新编码为不同的记录类型，而共享模型有意避免这一点。

### 在证据包中调用 `ctx.llm`

否决。直接调用会把模型选择与模型可见请求记录移出 Academic 工作流。由调用方提供生成器既能复用证据策略，也让工作流保持 Session 可重建性。

### 消费面向模型的 `web_fetch` 文本

否决。该文本把展示标题、不可信内容提示、Markdown 转换和截断提示与正文混合，并丢失原始响应字段。消费原始服务结果可以在学术解析前保留状态、最终 URL、正文类型与截断标记。

### 添加通用 HTML 解析器抽象

否决。当前 HTML 路径只需要语义化文章标题和段落。有界标签子集使证据包保持无依赖；当真实样例要求支持提供方特有或非语义布局时，再引入解析器。

### 内置关键词抽取器

否决。关键词规则无法可靠区分方法、发现、条件与局限。该操作改为接收语义生成器，并对生成结果执行确定性的来源校验。

## 后果

**构造失败清晰。** 版本不匹配、错误的等级-定位配对、无效范围或空字段在构造时抛出，因此分析永远收不到内部不一致的证据。

**生成引文由来源支持。** 抽取操作在构造证据前拒绝空内容、无效片段引用，以及没有出现在对应片段中的引文。

**部分资源不会成为全文证据。** 失败、截断、落地页、仅摘要与无文本 PDF 结果会在证据抽取前失败。接受的片段指向其成果版本，并携带用于推导的准确规范化 HTML 或 PDF 字节哈希。

**模型执行仍由工作流拥有。** 证据包提供抽取指令与组装规则，但不选择模型、不调用 `ctx.llm`、不校验模型 wire 输出，也不追加 Session 事件。

**直接构造函数仍然宽松。** `extractEvidenceFromContent()` 始终产生可用片段与哈希；直接调用 `createEvidenceRecord()` 的调用方仍可表达不可用值。

**HTML 与 PDF 使用不同定位。** HTML 产生带章节的段落号；PDF 产生物理 PDF 页码。纯文本、OCR 与非语义化提供方布局仍不支持。

## 延后工作

- 持久化记录与卡片、记录 `RetrievalRun`/覆盖的工作流集成。
- 组合多个抽取草稿证据的卡片条目；每个生成条目目前只引用自身记录。
