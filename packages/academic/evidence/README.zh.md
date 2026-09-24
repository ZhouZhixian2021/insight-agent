---
description: "获取并准备学术 HTML/PDF 全文，再使用调用方提供的语义抽取构造可追溯证据记录和六分区证据卡片。"
kind: "package-library"
---

# @deepseek-ai/dsh-academic-evidence

[English](README.md) | 中文

## 概述

`dsh-academic-evidence` 获取并准备完整的学术 HTML 或 PDF 正文，并把可定位的摘要或全文片段转换成已验证的来源定位、证据记录与六分区证据卡片。调用方提供 web 抓取器与语义生成器，本库核对每段引文确实存在于来源内容中，并强制版本与证据等级一致。它是库，不是 Cordis 服务或插件；Provider 选择、模型路由和持久请求记录仍由调用工作流负责。

## 目录

- [使用本包](#use-this-package)
- [API](#api)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把按优先级排列的 HTML/PDF URL 与 `ctx.web.fetch()` 的薄适配器传给 `fetchAcademicFullText()`，再把其输出交给 `extractEvidenceFromContent()`。第一个确认的全文会被采用：语义化 HTML 生成带章节的段落定位，PDF 则由 PDF.js 生成页码定位。两条路径都拒绝非 2xx 或截断响应，并附上最终 URL 与已接受原始内容的 SHA-256。

调用方只提供从所选学术版本的来源记录解析出的 URL，不提供 Web 发现 URL。Web 搜索摘要和 Provider 生成的答案都不是已抓取的论文正文。直接调用 `extractEvidenceFromContent()` 时，调用方必须先核验可定位的论文片段；逐字引文匹配只核对草稿与这些片段，不能单独证明片段的来源。

```text
const source = await fetchAcademicFullText({
  academicWorkId, workVersionId, sourceProvider, retrievedAt,
  extractionMethod, focusQuestions, urls: [htmlUrl, pdfUrl],
}, (url, signal) => ctx.web.fetch({ url }, signal), signal)
const result = await extractEvidenceFromContent(source, generator, signal)
```

当工作流已有经过核验且可定位的论文片段时，可以直接调用 `extractEvidenceFromContent()`。生成器接收抽取指令、关注问题、可定位片段和取消信号；生成器必须先校验任何外部模型输出，再返回有类型的草稿。

```text
const result = await extractEvidenceFromContent({
  academicWorkId, workVersionId, sourceProvider, sourceUrl, retrievedAt,
  contentHash, extractionMethod, focusQuestions,
  segments: [{ text: paragraph, locator: { kind: 'paragraph', paragraphNumber: 4 } }],
}, generator)
```

结果包含 `sourceLocators`、`evidenceRecords` 和一张 `evidenceCard`。每段引文必须逐字存在于所引用的片段中。有效片段索引指错位置时，只有未经改写的引文在全部输入片段中恰好出现一次，抽取器才会纠正定位；歧义、规范化改写、不存在、空内容或非法索引仍会在不可追溯证据进入分析前以 `EvidenceError` 失败。当调用方已有经过验证的证据时，仍可使用底层构造函数：

```text
const locator = createSourceLocator({ kind: 'paragraph', workVersionId, paragraphNumber: 4 })
const record = createEvidenceRecord({
  academicWorkId, workVersionId, level: 'fulltext', sourcedStatement: '...',
  sourceLocator: locator, verbatimExcerpt: { status: 'available', value: '...' },
  sourceProvider: 'arxiv', sourceUrl: '...', retrievedAt: '...',
  contentHash: { status: 'available', value: '<sha>' }, extractionMethod,
})
const card = createEvidenceCard({ academicWorkId, workVersionId,
  researchQuestions: [{ statement: '...', evidenceIds: [record.evidenceId], questionType: { status: 'available', value: 'causal' } }],
  methods: [], datasets: [], metrics: [], findings: [], limitations: [] })
```

当定位范围无效、记录版本或等级与定位不一致、陈述或来源字段为空、或卡片条目未引用任何证据时，构造会以 `EvidenceError` 清晰地失败。

抽取逐条拒绝模型提供的无效来源引用。`EvidenceExtractionResult.rejectedDrafts` 保存被拒草稿从零开始的 `draftIndex`、`segmentIndex`、稳定的 `code` 与诊断 `reason`；只有合格草稿会生成记录、定位和卡片条目。空引文、无效片段序号、未匹配或有歧义的引文不会丢弃其他合格草稿。逐字核验仍是必需条件，包括 Unicode 和公式痕迹。程序拥有的输入无效、生成器错误和取消仍会使调用失败。模型未提出证据时返回空记录和空拒绝列表；全部被拒时返回空记录与拒绝列表。JSON 结构校验仍由调用方负责。

-----

<a id="api"></a>
## API

| 导出 | 角色 |
|---|---|
| `fetchAcademicFullText()` | 按顺序尝试候选 URL，准备第一个确认的 HTML 或 PDF 全文。 |
| `prepareFetchedAcademicFullText()` / `prepareFetchedAcademicPdf()` | 校验一次原始抓取，并准备带段落或页码定位的内容与哈希。 |
| `extractEvidenceFromContent()` | 执行语义抽取、核验逐字引文，并构造单篇论文的记录与卡片。 |
| `createSourceLocator()` | 构造六种定位变体之一，附带全新身份。 |
| `createEvidenceRecord()` | 构造记录，校验定位版本、等级与非空字段。 |
| `createEvidenceCard()` | 构造卡片，附带全新条目身份并逐条校验。 |
| `SourceLocatorInput` | 六种构造输入，每种定位类型一个。 |
| `EvidenceRecordInput` / `EvidenceCardInput` | 记录与卡片的构造输入。 |
| `EvidenceExtractionInput` / `EvidenceExtractionResult` | 可定位论文输入与已验证的单篇论文结果。 |
| `AcademicWebFetchResult` / `FetchedAcademicFullTextInput` | HTML/PDF 准备接受的结构化抓取结果与论文来源信息。 |
| `EvidenceGenerator` / `EvidenceDraft` | 调用方拥有的语义生成器及其有类型输出。 |
| `EvidenceError` | 携带稳定 `code` 的类型化构造失败。 |

-----

<a id="model-experience"></a>
## 模型体验

间接通过调用方提供的生成器应用抽取指令，并由分析或报告消费方呈现生成的记录与卡片；调用工作流负责模型选择、请求记录和输出校验。

#### KV Cache 影响

无直接失效；消费方负责记录排序与序列化进提示词。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **调用方拥有传输与模型**——调用方提供 `ctx.web.fetch()` 适配器与语义生成器，因此工作流继续拥有 Provider 选择和模型可见请求记录。
- **无 OCR 或提供方特有布局解析**——HTML 要求 `<article>` 含可识别标题与段落；PDF 必须包含可提取文本。扫描/图片 PDF、纯文本与非语义 HTML 会被拒绝。
- **每个生成的卡片条目只引用一条记录**——每个抽取条目引用同一草稿产生的记录；多片段综合需要以后增加草稿引用字段。
- **底层构造函数仍然宽松**——直接调用 `createEvidenceRecord()` 可以提供不可用片段或哈希；`extractEvidenceFromContent()` 始终产生可用片段与哈希。
- **无运行报告**——构造记录或卡片不记录任何 `RetrievalRun` 或覆盖统计。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变量：** 不发布配套。这个纯库不拥有事件流或可变运行时数据；聚焦单元测试固定 HTML/PDF 准备与回退、逐字引文核验、抽取组装、定位构造、版本/等级校验、空字段拒绝与卡片条目校验。
