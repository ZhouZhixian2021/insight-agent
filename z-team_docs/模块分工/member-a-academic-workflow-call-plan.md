# 成员 A：学术模块调用与交接计划

## 基线与范围

2026-09-18 以已合并的真实 Web 研究路径为集成基线。A 的正式 Remote 入口、B 的 arXiv、CVF、ACL Anthology 与 PMLR 多来源全文检索和部分成功批次，以及 C 的分析、评测、报告与 Web 运行结果页面均已接入。[runResearchDraft](../../packages/academic/workflow/src/pipeline.ts)提供有界明确查询到评测草稿的库级调用链，并生成 RetrievalRun 与 CoverageSummary；[AcademicResearchController](../../packages/api/academic-research-controller/src/index.ts)从已批准计划重建 Brief，按行解析一至三条明确查询，调用该链路并返回 JSON 安全的检索运行。完整工作流恢复、自动查询规划、重试及稳定的真实来源联网验收尚未完成。

## 调用顺序

| 顺序 | 已有入口与归属 | 输入 → 输出 | A 需要接入的工作 |
|---|---|---|---|
| 1. 研究批准 | [model](../../packages/academic/model/src/index.ts)：isExecutableResearchBrief | ResearchBrief → 当前版本是否获准执行 | 从用户需求形成 Brief，记录批准与版本；执行绑定获准版本，修改需求后重新批准。 |
| 2. 检索 | [source](../../packages/academic/source/src/index.ts)：ctx.academicSource.searchAll | 单条 query、maxResults、signal → 多来源 BatchResult、Provider、发现数、截断与限制 | 将不同子问题拆成一至三条有序明确查询；按顺序复用 B 的单查询接口，消费来源观察，不从论文数组推断调用与失败。 |
| 3. 去重与版本归并 | [ingestion](../../packages/academic/ingestion/src/index.ts)：createIngestIndex、ingestWorks | 既有索引、论文与版本对 → index、works、versions、audit | 保留跨批次索引和归并记录；后续使用归并后的身份，不使用提供方临时身份。模糊重复按审计结果处理。 |
| 4. 取得可定位全文 | [evidence](../../packages/academic/evidence/src/fetch-fulltext.ts)：fetchAcademicFullText | 论文版本、来源信息、有序 urls、fetcher → EvidenceExtractionInput | 从版本资料构造候选地址，适配 ctx.web.fetch，传递取消信号。HTML 优先是候选排列策略，函数按输入顺序尝试。 |
| 5. 抽取单篇证据 | [evidence](../../packages/academic/evidence/src/extract.ts)：extractEvidenceFromContent | 可定位片段、EvidenceGenerator → sourceLocators、evidenceRecords、evidenceCard | 提供真实模型生成器，校验模型 JSON，记录模型可见输入和结果；原文子串验证不能替代语义审核。 |
| 6. 跨论文分析 | [analysis](../../packages/academic/analysis/src/analyze.ts)：analyzeEvidence | AnalysisInput、获准 Brief、createdAt → prepared、claims、links、limitations | 汇总同批次作品、版本、证据、卡片与定位。函数内部调用 prepareAnalysisInput，不重复准备；当前仅整理方法和发现对比。 |
| 7. 评测与审核 | [eval](../../packages/academic/eval/src/index.ts)：evaluateClaims | Brief、Claim、关联、当前证据/版本/定位、reviews、assessedAt → ready / needs_review / blocked | 接入可信人工或独立评测审核，保留审核对应的证据集；无审核不得伪造 supported。 |
| 8. 报告生成 | [report](../../packages/academic/report/src/index.ts)：generateReport | EvaluationInput 加 works、limitations、mode、synthetic → ResearchReport | 可先生成 draft；final 必须重新核验，函数内部再次调用 evaluateClaims。还需满足非合成数据、中文、数字引用及受支持章节和长度要求。 |
| 9. 展示与下载 | [ui-academic-research](../../packages/client/ui-academic-research/src/index.ts)：renderResearchPage | ResearchReport、语言 → 独立 HTML 字符串 | 明确产物保存与交付方式；独立页面不是已接入主 Web 的实时研究界面。 |

步骤 7 可用于提前显示问题；步骤 8 的再次核验不能用步骤 7 的旧结果替代。ResearchStage 只有粗粒度生命周期，检索、全文、证据、分析、审核进度应另行设计，不能直接向其枚举加入这些步骤名称。

## 实施前需要解决的接口衔接

第一项采用[全文内容与论文版本交接规则](academic-content-version-handoff.md)的最小接法：A 在首次解析后补齐当前版本的内存副本，沿用现有 B、C 接口；已有哈希冲突时拒绝覆盖。单篇交接与有界明确查询批次已由 [runResearchDraft](../../packages/academic/workflow/src/pipeline.ts) 接入，运行、证据与卡片持久化尚未接入。

1. **版本与哈希**：提供方返回的版本可能尚未提取 contentHash，全文解析则产生实际内容哈希。A 与 B 需明确版本记录、EvidenceRecord、SourceLocator 如何指向同一份内容，以及内容变化如何产生后继记录；不能为通过评测而覆盖历史版本或制造哈希。
2. **生成器与数据校验**：B 已提供 EvidenceGenerator 接口，实际模型适配、JSON 解析校验与模型输入的会话记录由 A 接入；这是实际证据生产的必要前置工作。
3. **失败与降级**：全文函数全部候选失败时不自动降级摘要。A 把来源、全文和抽取失败记录进 RetrievalRun，保留其他成功论文；取消停止后续调用并保留已完成结果。摘要降级继续留待后续。
4. **统计与报告**：A 已用 CoverageSummary 和 RetrievalRun 记录真实运行统计、纳入筛选与截断原因，并通过 Remote 返回给 C。C 的 EvaluationInput 当前不接收 CoverageSummary，因此报告评测不能声称已验证完整检索覆盖。
5. **输入限制执行**：查询参数目前只有 query 和 maxResults；时间窗口、范围、停止条件等 Brief 要求不能假定提供方已全部执行。A 列出工作流必须检查的规则，并把无法满足的要求显式拒绝或披露。
6. **恢复与审核身份**：IngestIndex 包含 Map，不能直接 JSON.stringify 后当作可恢复状态。A6 需定义编码、解析校验和版本策略；语义审核的可信来源、适用证据及重新审核条件需明确。

## 多来源结果交接

本轮复用 A5 已发布的 `BatchResult<T>`、`ProviderFailure`、`CoverageSummary` 和 `RetrievalRun`，不新增第二套失败或覆盖类型。B 拥有来源执行结果，A 拥有运行汇总，C 只读取浏览器安全投影。`providerBreakdown` 继续为 `null`；没有已确认的逐来源统计需求，不提前扩展共享字段。

### B 向 A 提供的搜索批次

B 为多来源搜索结果提供来源包拥有的批次结构，字段如下。这个结构复用 `BatchResult<AcademicSourceWork>`，不进入 `academic-model`，因为 `AcademicSourceWork` 属于来源能力。

| 字段 | 含义 |
|---|---|
| `providers` | 实际发起搜索的 Provider ID，包含成功返回零条和失败的 Provider，去重并保持确定顺序。 |
| `discoveredRecords` | 应用总结果上限前，各 Provider 实际返回的记录数总和；只能来自执行观察。 |
| `batch` | `BatchResult<AcademicSourceWork>`；成功项保留在 `items`，来源级失败保留在 `failures`。 |
| `truncated` | Provider 或来源服务因数量上限丢弃了结果。 |
| `limitations` | 来源声明的覆盖限制，例如仅搜索配置的会议或论文集目录；不能用模型估算。 |

单个 Provider 的网络、限流、上游或解析失败进入 `batch.failures`，其他 Provider 继续。所有 Provider 运行失败时返回 `status: failed` 和完整失败列表。没有可用 Provider、配置不合法及重复注册属于运行时配置错误，继续尽早抛出；用户取消进入整轮取消，不伪装成 `ProviderFailure`。

### A 生成的运行汇总

A 在工作流结束或取消时建立一条 `RetrievalRun`。`queries` 保存实际执行的查询，`providers` 直接采用 B 的观察，`failures` 合并来源搜索失败和工作流观察到的全文获取或抽取失败。全文与抽取失败必须保留 `affectedWorkVersionId`；日志和浏览器返回不复制凭据或未经清理的异常文本。

`CoverageSummary` 的计数使用以下统一口径：`discoveredRecords` 取 B 的搜索观察；`deduplicatedWorks` 取摄取后的成果数；`includedWorks` 只计算实际进入分析的成果；`availableFulltextWorks` 计算已成功取得全文的成果；当前流程不降级摘要或元数据，因此 `abstractOnlyWorks` 和 `metadataOnlyWorks` 为零；`failedOperations` 等于运行记录中的失败项数。来源声明的覆盖限制、来源截断或失败、候选或纳入数量上限都会令覆盖 `truncated` 为 true，并在 `limitations` 中说明原因。

终态 `status` 采用 A5 批处理语义：没有失败为 `success`，存在成功纳入成果和失败为 `partial_success`，没有成功纳入成果且存在失败为 `failed`。正常零结果仍是 `success`。取消通过 `stage: cancelled` 表达，并保留取消前的成功项和失败；`status` 仍只描述已返回成果与失败的组合。

### A 向 C 提供的浏览器结果

`AcademicResearchRunValue` 包含必有且 JSON 安全的 `retrievalRun`，提供运行 ID、阶段、批次状态、查询、Provider、覆盖统计和失败列表。C 使用该投影显示来源失败、覆盖不足和截断原因，不从论文数组反推调用了哪些 Provider，也不把 `completed` 解释为证据充分或人工审核通过。现有 `report.evaluation` 继续单独表达草稿质量。

本轮不开始逐来源统计、自动查询规划、自适应追加检索、自动重试、持久恢复或进度流。B 的单查询搜索批次和 A 的有界查询编排及 `RetrievalRun` 已接通；C 继续使用 A 的正式 Remote 类型消费真实返回。

B、C 的具体字段、行为矩阵、修改范围和固定输入输出见[多来源研究运行交接说明](academic-multi-source-run-handoff.md)。

## 真实双查询端到端验收基线

本基线用于三人完成当前来源、工作流和 Web 改动后的同题验收。它只验证已经实现的明确查询流程，不引入自动查询生成、自动重试、分段抽取、持久恢复或新的公共字段。

### 固定研究需求

在新的“学术洞察”会话中选择可用模型，发送以下完整需求，并在计划审核卡中核对 Research Brief 后批准：

> 请研究 Transformer 自注意力机制相对于循环神经网络在长距离依赖建模上的主要优势，以及 BERT 如何利用双向 Transformer 预训练获得上下文表示。范围限定为 2017—2020 年，优先使用论文全文，纳入 Transformer 和 BERT 的代表性论文。最多候选 5 篇，最终纳入 2 篇，输出中文研究草稿，并明确证据限制。

批准前至少核对以下字段。计划不满足时继续修改，不用错误计划开始研究。

| Research Brief 项目 | 固定值或要求 |
|---|---|
| `publicationWindow` | 2017 至 2020，依据 `first_public_release`。 |
| `questions` | 分别覆盖自注意力相对 RNN 的长距离依赖优势，以及 BERT 的双向 Transformer 预训练。 |
| `includedWorkTypes` | 同时允许 `preprint` 与 `version_of_record`。 |
| `evidenceRequirements` | 至少纳入 2 篇、至少 2 篇全文、证据级别为 `fulltext`、要求可定位证据、允许预印本。证据不足时继续但明确警告。 |
| `reportRequirements` | 语言为中文，包含方法、证据限制和研究缺口，使用编号引用。 |
| `stopConditions` | `maximumSearchRounds: 2`、`maximumCandidateWorks: 5`、`maximumIncludedWorks: 2`。 |

计划批准后，在“学术研究”页面按原顺序输入以下两行。每行是一条明确查询：

```text
Transformer self-attention long-range dependencies recurrent neural networks
BERT bidirectional Transformer pre-training contextual representations
```

### 验收前置条件

1. A 的明确查询编排已经进入当前运行的 Web 构建，Remote 请求仍使用 `query: string`，换行必须原样传到后端。
2. B 的来源配置覆盖 2017—2020 年目标论文所在目录，并且运行环境能够访问相应来源和全文地址。
3. C 的页面允许输入多行文本，提示“一行一条、最多三条”，并且不把换行折叠为空格。
4. 当前会话已经选择模型并批准上述 Research Brief；本次运行使用同一个 Session。

### 两级验收结论

**流水线接线通过**要求以下事实全部成立：

1. 页面收到结构化运行结果，不出现未捕获的“请求异常”。
2. `retrievalRun.queries` 按顺序精确记录上面两条查询，既不重复也不合并成一条。
3. 第二条查询在第一条返回来源失败批次后仍会执行；用户取消时才停止尚未开始的查询。
4. `retrievalRun.providers`、`failures`、`coverageSummary` 来自实际运行观察；`failedOperations` 等于失败记录数量。
5. `deduplicatedWorks` 不大于 `discoveredRecords`，`includedWorks` 不大于 2，`availableFulltextWorks` 不大于 `includedWorks`。
6. 来源失败、来源覆盖限制、来源截断、候选上限、纳入上限或论文处理失败发生时，`coverageSummary.truncated` 与 `limitations` 如实披露。
7. `retrievalRun.stage: completed` 只表示运行结束；页面不得据此显示人工审核通过。

**研究内容通过**还要求以下事实全部成立：

1. 去重后能识别 Transformer 与 BERT 两篇代表性工作，最终纳入 2 篇，且两篇均成功取得全文并抽取证据。
2. 中文草稿分别回答两个研究问题，实质性结论能追溯到原文摘录和来源定位。
3. 草稿明确说明来源目录、检索失败、全文失败、抽取失败和人工审核状态等真实限制。
4. 没有独立语义审核时，`report.evaluation` 允许是 `needs_review` 或 `blocked`；这表示草稿不能作为最终报告交付，不等于 Remote 或检索流水线失败。

若只满足第一组，则记录“接线通过、内容未通过”，根据失败归属继续处理。若第一组也不满足，A 先按 `retrievalRun` 和页面请求错误定位接口或编排问题。

### 2026-09-18 真实运行结果

在 PR #28 合并并完成全量构建后，使用上述 Brief 和两条查询完成一次真实 Web 运行。页面返回结构化终态，两条查询按顺序执行，第一条的来源失败没有阻止第二条，因此“流水线接线通过”。运行共发现 10 条记录，候选上限保留 5 篇，最终纳入 0 篇、可用全文 0 篇；ACL 与 PMLR 在两轮查询中共发生 4 次搜索失败，arXiv 两篇候选共发生 2 次全文获取失败，报告被正确标记为“阻止交付”，因此“研究内容未通过”。

本次还发现 `deduplicatedWorks` 显示为限额后的 5，而限制说明记录“从 10 篇去重论文保留 5 篇”。A 已将该字段统一为各查询实际返回记录经过跨查询去重、但尚未应用本轮全局候选上限时的数量；`RetrievalRun.academicWorkIds` 继续保存上限内保留的候选。同类运行应显示 10 篇去重论文和 5 个候选 ID。B 继续处理来源联网、目标目录和全文获取，C 的多行输入及终态展示无需因本次结果返工。

### 失败归属

| 观察结果 | 首要负责人 |
|---|---|
| 查询被合并、顺序错误、来源失败后未继续、运行统计或状态不一致 | A |
| 来源联网失败、2017—2020 目录未配置、目标论文未命中、全文地址或解析失败 | B |
| 页面不能输入两行、换行未保留、状态或限制文案误导 | C |
| 模型路由、凭据或外部网络不可用 | 联调环境问题，由 A 记录后交给对应配置负责人处理。 |

## 模型抽取接入：输入、返回与检查规则

本节是 2026-09-15 的模型适配实施约定。[parseEvidenceDrafts](../../packages/academic/workflow/src/parse-evidence.ts) 已实现完整回答的 JSON 与字段检查；createModelEvidenceGenerator 已接入 DSH 模型调用、输出结束检查、输入估算和 Session 请求/结果记录，尚未完成真实模型联网验收。字段以 B 的 [EvidenceGenerationRequest / EvidenceDraft](../../packages/academic/evidence/src/types.ts) 和 A 的[证据卡类型](../../packages/academic/model/src/types.ts)为准；不修改 B、C 的业务接口。

### 发给模型的内容

| 内容 | 来源与用途 |
|---|---|
| 抽取指令 instruction | 沿用 B 的要求：陈述必须由所给原文支持，摘录必须来自对应片段，不推断缺失值。 |
| 研究问题 focusQuestions | 限定本次关注点；与论文作者提出的研究问题分开。 |
| 论文片段 segments | 保留数组顺序、原文 text 和位置 locator；提示模型按从 0 开始的数组下标引用片段。 |
| 返回格式说明 | A 补充下述 JSON 格式、栏目字段及可用性状态说明；与实际发送内容一起记录。 |

论文原文作为待分析资料，不能作为调用工具或更改抽取规则的指令。signal 只控制程序取消，不序列化到模型输入。论文 ID、版本 ID、内容哈希、来源 URL 和获取时间由程序维护；模型不生成或改写这些值。单次调用与具体论文的日志关联方式在 Session 接入时确定，不能从模型回答反推身份。

### 模型返回的证据草稿

返回纯 JSON 数组，每个元素代表一条有原文依据的陈述；不加 Markdown 围栏或解释性前后缀。

| 字段 | 格式与含义 |
|---|---|
| segmentIndex | 非负整数，指向本次输入中确实存在的片段，从 0 开始。 |
| sourcedStatement | 非空字符串，说明这段原文支持什么陈述。 |
| verbatimExcerpt | 非空原文摘录，不翻译或改写；B 在去除首尾空白后检查其是否为对应片段的连续子串。 |
| cardItems | 数组；每项包含 section、非空 statement 和该栏目的专有字段。可为空，不强迫模型为每条证据填满六栏。 |
| qualityNotes | 可省略；提供时为字符串数组，用于注明证据局限。 |

各栏目都使用现有 EvidenceCardItemDraft，不让模型生成 evidenceCardItemId 或 evidenceIds。下表的专有字段都是必填的 Availability 对象，缺少信息时也不能直接省略或填 null。

| section | 中文含义 | 专有字段 |
|---|---|---|
| researchQuestions | 论文的研究问题 | questionType |
| methods | 方法 | methodName、methodRole |
| datasets | 数据集 | datasetName、version、split、scale |
| metrics | 指标 | metricName、value、unit、direction、evaluationContext |
| findings | 发现 | findingType、conditions |
| limitations | 局限 | limitationType |

Availability 沿用五态：available 携带正确类型的 value；unknown 和 not_applicable 携带 reason；not_extracted 可带 reason；failed 需要真实 failureId 和 reason。字符串、数字和枚举值按共享类型检查，不能用任意字符串替代枚举。模型不应编造 failureId；本次输入没有提供可引用的真实失败记录，因此模型输出中的 failed 不予接受。模型调用失败由 A 的调用记录表达，不伪装成某个论文属性的 failed。原文不足以确定属性时使用 unknown，并说明所给片段未提供信息，不据此断言整篇论文都未报告。

下面是合成格式示例，不是真实论文结论。假设片段 0 的全文为 “We propose Method X for document classification.”，模型可以返回：

```json
[
  {
    "segmentIndex": 0,
    "sourcedStatement": "论文提出 Method X 用于文档分类。",
    "verbatimExcerpt": "We propose Method X for document classification.",
    "cardItems": [
      {
        "section": "methods",
        "statement": "提出用于文档分类的 Method X。",
        "methodName": { "status": "available", "value": "Method X" },
        "methodRole": { "status": "available", "value": "proposed" }
      }
    ]
  }
]
```

### 检查与失败处理

1. A 检查模型是否正常完成。错误、取消、输出截断或意外工具调用不能当作完整证据输出。
2. A 解析 JSON，并检查顶层数组、必填字段、字段类型、六栏枚举和 Availability 各分支。任一草稿格式错误则本次抽取失败，不通过类型断言直接交给 B，也不悄悄保留部分条目。
3. B 沿用现有检查：段落索引有效、摘录对应原文、陈述非空、版本与定位一致；由程序生成证据及卡片身份。格式正确和摘录匹配不代表语义已经审核通过。
4. 没有可提取证据时允许返回空数组；这不代表研究问题已解决或论文已完整覆盖。调用失败不能转为空数组。失败由现有流水线登记为该论文 extraction 阶段失败，其他论文继续；用户取消则停止整轮后续调用，保留已完成结果。
5. 用户确认：全文超过模型输入上限时，第一版暂停该论文并记录原因，其他论文继续；不静默截取前半篇，不自动分批。已使用 DSH 的近似消息估算计入完整提示词、片段及输出预留，并与提供方解析的模型容量比较；预算未知则在发送前失败。用户接受近似计数可能低估，提供方仍可能拒绝被放行的请求。
6. 用户确认：会话保存失败时停止整轮。请求及结果均经 SessionStore 刷新并读回核验；无活动写入器、写入失败或内容不一致抛出 WorkflowLogError，流水线不会将其吞为普通论文失败。完整工作流恢复和已生成证据身份的持久化另行实现。

库级验证已覆盖六栏输出、缺失值、空数组、坏 JSON、缺字段/错误类型、非法枚举、编造失败 ID、无效索引、摘录不存在、模型截断/取消、超限不发送及继续其他论文、日志失败停止整轮和真实存储读回。SDK 回放准备的 Windows 路径 JSON 转义已修复。经用户同意，Academic 专用场景使用已有 sdk-minimal 配置并关闭终端工具，已通过基准生成和只读回放，校验 B 实际生成的证据、持久化记录和 TypeScript SDK 通知/结果。原有完整配置标题场景的 Bash/PowerShell 差异未改动；Python 源码 SDK 已通过构建后 dsh CLI 的进程投影测试，仍有关闭流的 ResourceWarning 待 SDK 后续修复。新增 runModelResearchDraft 整轮入口及两篇论文贯通测试，连接实际模型服务、B 证据和 C 评测草稿；真实模型、安装 wheel 和主产品入口验收仍待完成。重启恢复仍属后续步骤。

## 后续：A6 输入清单

先以“已取得并保存一篇论文的证据，重启后恢复这份证据并继续分析”为候选最小场景，确认保存格式后再实现。待保存对象包括 Brief 及批准版本、运行记录与失败、原始来源到归并身份的映射及审计、实际版本与内容哈希、解析片段或可复核内容引用、证据与定位、Claim 快照、审核记录、报告产物及步骤完成记录。明确各对象的唯一存储位置和恢复条件，不把整个运行对象随意写入现有 Session。

先阅读现有 Session 的版本和事件机制，再决定哪些数据进入事件、哪些进入独立产物，以及必要的 SDK 和会话快照变化。中断后不能无条件重复已完成的模型调用；保存完成与步骤完成标记的关系需在设计中确定。本计划不承诺当前已经支持恢复。

## 三方交接与并行顺序

| 成员 | 可立即并行 | 依赖与交接 |
|---|---|---|
| A | 梳理保存对象、调用适配与错误映射；设计最小恢复场景 | 先确定身份、哈希和状态接口，再实现工作流；协调根配置、锁文件与 Preset 修改。 |
| B | 真实 arXiv HTML/PDF 验证；提供失败、摘要与全文样例 | 与 A 对齐归并后的版本、哈希和候选地址，配合实际模型证据抽取联调。 |
| C | 固定证据的分析与报告回归；审核流程及界面需求整理 | 提供 reviews 输入样例和统计展示需求；主 Web 的实时进度与恢复接入需等待 A 的工作流接口。 |

顺序：共享接口确认 → 各模块独立验证 → A 串联真实执行 → 三方使用同一课题验收。C 可以先用固定证据开发，不必等待 B 的联网验收；最终真实报告验收需要完整证据路径。A6 解析与保存实现和 B、C 的模块验证可以并行。

## 待改进事项

| 事项 | 当前决定与状态 | 后续改进及完成依据 | 负责人 |
|---|---|---|---|
| 自动多轮检索 | 2026-09-18 已完成最小的有界明确查询编排：调用方按行提供最多三条查询，数量不得超过 Brief 的 `maximumSearchRounds`；查询串行执行，批次轮转合并并精确去重，统一应用全局候选上限。某条查询的来源失败批次不阻止后续查询，取消则停止；不使用额外模型规划查询。 | 后续再设计自动查询调整、跨运行索引复用、重试、饱和判定、时间预算与达到证据量后的停止。实现前确认具体策略；用测试证明有界执行、停止原因可追溯、失败不会丢失已取得证据。 | A；B、C 提供相应输入与验收样例。 |
| 超长论文分批抽取 | 2026-09-15 用户确认第一版超限暂停该论文并记录原因，其他论文继续；输入估算检查与模型接入已在库级实现并验证。 | 后续确认分批大小、原始段落编号映射、跨批证据合并和覆盖记录后再实现；不静默丢弃正文。 | A；B 配合片段定位验收。 |
| 哈希冲突的核对与继续处理 | 2026-09-15 确认：原因未明时暂停该论文，其他论文继续；记录冲突，不覆盖旧数据。规则详见[全文交接规则](academic-content-version-handoff.md)，单篇暂停返回已实现，记录保存与恢复尚未接入。 | 根据实际冲突样例确定人工核对及重新处理方式；确认内容变化则创建新版本，单纯格式差异不判为改版。能定位原因、明确处理结果并继续该论文，且保留历史证据后，再标记完成。具体自动化方案实施前由 A 确认。 | A；涉及解析原因时由 B 配合。 |

返回[团队文档索引](../00-团队文档索引.md)。
