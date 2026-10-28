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
- [增量抽取](#incremental-extraction)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把按优先级排列的 HTML/PDF URL 与 `ctx.web.fetch()` 的薄适配器传给 `fetchAcademicFullText()`，再把其输出交给 `extractEvidenceFromContent()`。第一个确认的全文会被采用：语义化 HTML 生成带章节的段落定位，PDF 则由 PDF.js 生成页码定位。两条路径都拒绝非 2xx 或截断响应，并附上最终 URL 与已接受原始内容的 SHA-256。`fetchAcademicFullText()` 接受一个可选的逐候选观察者：每个候选尝试开始时发布 `started`，结束时发布 `settled`（`success`/`failed`/`cancelled`、失败类别与已接受正文类型）；观察者异常被隔离，绝不改变抓取结果。

调用方只提供从所选学术版本的来源记录解析出的 URL，不提供 Web 发现 URL。Web 搜索摘要和 Provider 生成的答案都不是已抓取的论文正文。直接调用 `extractEvidenceFromContent()` 时，调用方必须先核验可定位的论文片段；逐字引文匹配只核对草稿与这些片段，不能单独证明片段的来源。

```text
const source = await fetchAcademicFullText({
  academicWorkId, workVersionId, sourceProvider, retrievedAt,
  extractionMethod, focusQuestions, urls: [htmlUrl, pdfUrl],
}, (url, signal) => ctx.web.fetch({ url }, signal), signal)
const result = await extractEvidenceFromContent(source, generator, signal)
```

当工作流已有经过核验且可定位的论文片段时，可以直接调用 `extractEvidenceFromContent()`。生成器接收要求选择明确受支持的事实、逐字摘录及六分区之一的指令，以及关注问题、可定位片段和取消信号；生成器必须先校验任何外部模型输出，再返回有类型的草稿。调用方可以把未抽取的卡片属性标为 `not_extracted`。

```text
const result = await extractEvidenceFromContent({
  academicWorkId, workVersionId, sourceProvider, sourceUrl, retrievedAt,
  contentHash, extractionMethod, focusQuestions,
  segments: [{ text: paragraph, locator: { kind: 'paragraph', paragraphNumber: 4 } }],
}, generator)
```

结果包含 `sourceLocators`、`evidenceRecords`、本次运行专用的 `questionLinks` 和一张 `evidenceCard`。草稿的可选 `questionIndexes` 指明同一段逐字引文直接支持哪些输入关注问题。抽取器校验每个序号，并把批准问题的原文复制到 `questionLinks`；无效关联只拒绝该条草稿。持久化 `EvidenceRecord` 仍与某一版 Brief 无关。每段引文必须逐字存在于所引用的片段中。有效片段索引指错位置时，只有未经改写的引文在全部输入片段中恰好出现一次，抽取器才会纠正定位；歧义、规范化改写、不存在、空内容或非法索引仍会在不可追溯证据进入分析前以 `EvidenceError` 失败。当调用方已有经过验证的证据时，仍可使用底层构造函数：

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

在 `EvidenceExtractionInput` 中设置 `depth: 'minimal'`，请求三至五条围绕研究问题的事实；来源支持不足时允许少于三条。必须提供已批准的 `focusQuestions`，每条保留草稿必须关联其中至少一个问题。抽取器最多保留五条已核验记录，允许卡片分区为空或属性为 `not_extracted`。缺少或为空的问题关联只拒绝该条草稿。省略深度或设置 `depth: 'complete'` 时，使用六分区抽取指令且不应用此记录上限。两种模式均保留逐字摘录、定位、内容哈希、来源字段、抽取方法与实际论文版本。

使用 `enhanceEvidenceInFragments(source, initialEvidence, options, signal)`，对已提交的一级证据执行完整六分区补充抽取。原文必须与初始论文、版本和内容哈希一致；缺少证据或引用关系不一致时，在模型派发前拒绝。不同的抓取正文须单独抽取。增强保留每条初始记录、定位、问题关联和卡片条目，包括其身份、来源字段与抽取方法，并沿用初始卡片 ID。定位、陈述和摘录相同的记录复用已有证据 ID；新增问题关联和卡片分类可以引用它们。相同分类只保留一份，不同分类保留为独立条目。

增强提交回调只接收新增内容和草稿拒绝事实，沿用初始卡片 ID；新增条目可以引用此前已提交的证据，而不重复发送其记录和定位。调用方必须在增强前提交初始证据，并在下一个片段运行前持久化每次补充。返回结果合并初始证据与已提交的补充。已分类失败保留此前证据并标明未完成范围；取消、未分类失败和提交错误会使调用失败，调用方仍持有此前提交。空分区、保留的 `not_extracted` 属性和抽取成功均不证明语义支持、独立审核或正式交付资格。库不激活工作流升级，也不选择模型。

当定位范围无效、记录版本或等级与定位不一致、陈述、来源提供方、来源 URL 或获取时间为空、或卡片条目未引用任何证据时，构造会以 `EvidenceError` 清晰地失败。

抽取逐条拒绝模型提供的无效来源引用。`EvidenceExtractionResult.rejectedDrafts` 保存被拒草稿从零开始的 `draftIndex`、`segmentIndex`、稳定的 `code` 与诊断 `reason`；只有合格草稿会生成记录、定位和卡片条目。空引文、无效片段序号、未匹配或有歧义的引文不会丢弃其他合格草稿。逐字核验仍是必需条件，包括 Unicode 和公式痕迹。程序拥有的输入无效、生成器错误和取消仍会使调用失败。模型未提出证据时返回空记录和空拒绝列表；全部被拒时返回空记录与拒绝列表。JSON 结构校验仍由调用方负责。

-----

<a id="api"></a>
## API

| 导出 | 角色 |
|---|---|
| `fetchAcademicFullText()` | 按顺序尝试候选 URL，准备第一个确认的 HTML 或 PDF 全文。 |
| `AcademicFullTextObserver` / `AcademicFullTextObservation` | `fetchAcademicFullText()` 的可选逐候选事实：每次尝试开始时发布 `started`，结束时发布 `settled`（`success`/`failed`/`cancelled`、失败 `FailureCategory` 与已接受 `bodyKind`）。事实不带时间戳，由观察者持有方打戳。 |
| `prepareFetchedAcademicFullText()` / `prepareFetchedAcademicPdf()` | 校验一次原始抓取，并准备带段落或页码定位的内容与哈希。 |
| `extractEvidenceFromContent()` | 执行语义抽取、核验逐字引文，并构造单篇论文的记录与卡片。 |
| `extractEvidenceInFragments()` / `EvidenceFragmentOptions` | 独立核验并提交更小的原文范围，使用调用方分类的局部恢复与明确输入／输出限制。 |
| `createSourceLocator()` | 构造六种定位变体之一，附带全新身份。 |
| `createEvidenceRecord()` | 构造记录，校验定位版本、等级与非空字段。 |
| `createEvidenceCard()` | 构造卡片，附带全新条目身份并逐条校验。 |
| `SourceLocatorInput` | 六种构造输入，每种定位类型一个。 |
| `EvidenceRecordInput` / `EvidenceCardInput` | 记录与卡片的构造输入。 |
| `EvidenceExtractionInput` / `EvidenceExtractionResult` | 可定位论文输入与已验证的单篇论文结果。 |
| `AcademicWebFetchResult` / `FetchedAcademicFullTextInput` | HTML/PDF 准备接受的结构化抓取结果与论文来源元数据。 |
| `EvidenceGenerator` / `EvidenceDraft` / `EvidenceQuestionLink` | 调用方拥有的语义生成器、有类型输出，以及本次运行中已接受的证据—问题关联。 |
| `EvidenceError` | 携带稳定 `code` 的类型化构造失败。 |

-----

<a id="incremental-extraction"></a>
## 增量抽取

向 `extractEvidenceInFragments()` 提供已核验论文输入，以及 [EvidenceFragmentPolicy](src/fragment-types.ts) 中的明确限制。相邻短段落会打包至 `maximumCharacters` 上限，长段落按重叠额度拆分；每次调用保留各段独立的来源定位和摘要字符偏移。草稿使用本次请求内的局部 `segmentIndex`；生成器还收到各原始来源范围、论文／版本身份、尝试次数、抽取阶段和输出额度。模型适配器必须将 `maximumOutputTokens` 应用于抽取调用并记录准确请求；合成使用独立的输出预算。

必需的异步 `onVerified` 保存接口在下一范围发送前收到已核验来源的证据。它负责持久存储；保存失败会停止抽取。已接受记录和卡片条目的身份保留到最终组装结果。重叠的相同证据按来源定位、陈述、逐字引文和问题关联去重。被拒草稿序号保持为回调对应片段中的局部序号。`onFailure` 仅发布信息且隔离异常；返回的失败保留原始错误，包括适配器提供的 Provider 请求 ID。

一级模式依次优先处理每个批准问题的词项命中，相同得分和未命中范围保持原文顺序。可选 `questionTerms` 按 `focusQuestions` 顺序为每个问题提供一组已批准词项或短语；数量不匹配会在模型派发前失败。调用方可复用已批准的初筛别名，让中文问题匹配英文原文。省略线索时使用问题中的词。原始片段、偏移与定位元数据保持不变；派发顺序改变时，`fragmentIndex` 仍标识原始打包组。词项或短语命中只安排阅读，不生成证据或证明问题覆盖。

调用方将可恢复失败分类为 `timeout`、`transport`、`parse_failed` 或 `incomplete_output`。超时、解析和输出不完整恢复只按来源边界拆分失败的打包请求；单个长范围在大小允许时减半。传输恢复以指数退避重发同一请求。`maximumAttempts` 限制每个初始打包请求的全部发送次数，包括两个子范围。生成器每次调用必须只执行一次模型尝试，不再嵌套分批或重试。耗尽预算或尚未发送的恢复范围进入 `incompleteFragments`；成功的同伴范围仍然可用。未分类失败和取消使调用拒绝，但已经提交的片段保留在保存接口中。

一级模式遇到超时、解析失败或输出不完整时，还会让同一论文的后续组从相同的有界拆分开始。两个子范围共用原始组的尝试预算。失败范围无法继续拆分时，直接标为不完整，不重复发送相同输入；队列中的其他范围与后续组仍在各自预算内继续。传输失败保留原始输入和退避规则。完整模式保留顺序派发与其重试规则。这些规则在固定夹具中减少调用；真实模型耗时和证据质量仍须独立校准。

一级模式在重叠去重之后、已核验结果接收端之前，对整篇论文应用五条上限。记录、定位、问题关联和卡片引用使用同一批保留身份。达到上限即停止抽取；未派发的原文范围保留在 `incompleteFragments` 中，不产生模型失败。批准问题中未出现在 `questionLinks` 的问题仍未获证据覆盖；五条记录不证明逐题覆盖完整。空卡片不会使已核验记录失效，也不表示完整审核通过。调用方负责准入、证据是否充分与报告交付；一级抽取不授予正式报告资格。

库在一篇论文内按顺序发送片段。失败事实提供连续超时／传输尝试次数，并在一个响应通过核验后清零，供工作流临时降低论文并发。调用方负责策略校准、模型超时、范围判断、Session 事件和并发调度。该 API 不会自动在 Academic Controller 中启用；工作流适配器必须选择它，并将这些事实映射到现有运行记录。

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
