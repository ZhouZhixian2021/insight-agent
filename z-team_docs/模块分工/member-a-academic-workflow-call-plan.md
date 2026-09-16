# 成员 A：学术模块调用与交接计划

## 基线与范围

2026-09-15 核对远程 master 为 88cde0f，本地个人分支 dev/zhouzhixian2021 已包含相同提交。范围包括 A5（PR #12）、B 的全文解析（PR #13）及 C 的报告模块（PR #14）。[runResearchDraft](../../packages/academic/workflow/src/pipeline.ts)已在本地实现单轮检索到评测草稿的库级调用链；[模型适配器](../../packages/academic/workflow/src/model.ts)已实现 DSH 模型服务调用及 Session 请求/结果记录，已用合成模型回答和真实本地存储验证。主 Web、真实模型联网验收与完整工作流恢复尚未完成。当前未提交或推送。

## 调用顺序

| 顺序 | 已有入口与归属 | 输入 → 输出 | A 需要接入的工作 |
|---|---|---|---|
| 1. 研究批准 | [model](../../packages/academic/model/src/index.ts)：isExecutableResearchBrief | ResearchBrief → 当前版本是否获准执行 | 从用户需求形成 Brief，记录批准与版本；执行绑定获准版本，修改需求后重新批准。 |
| 2. 检索 | [source](../../packages/academic/source/src/index.ts)：ctx.academicSource.search | query、maxResults、signal → works、truncated | 将研究问题转换为明确查询；选择提供方，记录实际调用与失败。当前一次调用选择一个提供方，多来源执行由 A 编排。 |
| 3. 去重与版本归并 | [ingestion](../../packages/academic/ingestion/src/index.ts)：createIngestIndex、ingestWorks | 既有索引、论文与版本对 → index、works、versions、audit | 保留跨批次索引和归并记录；后续使用归并后的身份，不使用提供方临时身份。模糊重复按审计结果处理。 |
| 4. 取得可定位全文 | [evidence](../../packages/academic/evidence/src/fetch-fulltext.ts)：fetchAcademicFullText | 论文版本、来源信息、有序 urls、fetcher → EvidenceExtractionInput | 从版本资料构造候选地址，适配 ctx.web.fetch，传递取消信号。HTML 优先是候选排列策略，函数按输入顺序尝试。 |
| 5. 抽取单篇证据 | [evidence](../../packages/academic/evidence/src/extract.ts)：extractEvidenceFromContent | 可定位片段、EvidenceGenerator → sourceLocators、evidenceRecords、evidenceCard | 提供真实模型生成器，校验模型 JSON，记录模型可见输入和结果；原文子串验证不能替代语义审核。 |
| 6. 跨论文分析 | [analysis](../../packages/academic/analysis/src/analyze.ts)：analyzeEvidence | AnalysisInput、获准 Brief、createdAt → prepared、claims、links、limitations | 汇总同批次作品、版本、证据、卡片与定位。函数内部调用 prepareAnalysisInput，不重复准备；当前仅整理方法和发现对比。 |
| 7. 评测与审核 | [eval](../../packages/academic/eval/src/index.ts)：evaluateClaims | Brief、Claim、关联、当前证据/版本/定位、reviews、assessedAt → ready / needs_review / blocked | 接入可信人工或独立评测审核，保留审核对应的证据集；无审核不得伪造 supported。 |
| 8. 报告生成 | [report](../../packages/academic/report/src/index.ts)：generateReport | EvaluationInput 加 works、limitations、mode、synthetic → ResearchReport | 可先生成 draft；final 必须重新核验，函数内部再次调用 evaluateClaims。还需满足非合成数据、中文、数字引用及受支持章节和长度要求。 |
| 9. 展示与下载 | [ui-academic-research](../../packages/client/ui-academic-research/src/index.ts)：renderResearchPage | ResearchReport、语言 → 独立 HTML 字符串 | 明确产物保存与交付方式；独立页面不是已接入主 Web 的实时研究界面。 |

步骤 7 可用于提前显示问题；步骤 8 的再次核验不能用步骤 7 的旧结果替代。ResearchStage 只有粗粒度生命周期，检索、全文、证据、分析、审核进度应另行设计，不能直接向其枚举加入这些步骤名称。

## 实施前需要解决的接口衔接

第一项采用[全文内容与论文版本交接规则](academic-content-version-handoff.md)的最小接法：A 在首次解析后补齐当前版本的内存副本，沿用现有 B、C 接口；已有哈希冲突时拒绝覆盖。单篇交接已由 [extractPaperEvidence](../../packages/academic/workflow/src/index.ts) 实现，完整批次与持久化尚未接入。

1. **版本与哈希**：提供方返回的版本可能尚未提取 contentHash，全文解析则产生实际内容哈希。A 与 B 需明确版本记录、EvidenceRecord、SourceLocator 如何指向同一份内容，以及内容变化如何产生后继记录；不能为通过评测而覆盖历史版本或制造哈希。
2. **生成器与数据校验**：B 已提供 EvidenceGenerator 接口，实际模型适配、JSON 解析校验与模型输入的会话记录由 A 接入；这是实际证据生产的必要前置工作。
3. **失败与降级**：全文函数全部候选失败时抛出错误，不会自动降级摘要。A 根据批准的最低证据要求决定是否使用摘要，并记录 ProviderFailure；不能把摘要标为全文，也不能清空其他成功论文。取消应停止后续调用并保留完成结果。
4. **统计与报告**：CoverageSummary、BatchResult、RetrievalRun 已有共享表示，但 C 的 EvaluationInput 当前不接收 CoverageSummary。A 记录真实运行统计、纳入筛选与截断原因；需要报告展示的统计由 A、C 明确传递接口，不能声称当前评测已验证完整检索覆盖。
5. **输入限制执行**：查询参数目前只有 query 和 maxResults；时间窗口、范围、停止条件等 Brief 要求不能假定提供方已全部执行。A 列出工作流必须检查的规则，并把无法满足的要求显式拒绝或披露。
6. **恢复与审核身份**：IngestIndex 包含 Map，不能直接 JSON.stringify 后当作可恢复状态。A6 需定义编码、解析校验和版本策略；语义审核的可信来源、适用证据及重新审核条件需明确。

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
| 自动多轮检索 | 成员 A 确认先完成第一步：runResearchDraft 每次只执行一轮检索，连接去重、全文、证据、分析和评测草稿；不自动发起第二轮。 | 第二步再设计跨轮索引复用、查询调整、重试、饱和判定、时间预算与达到证据量后的停止。实现前确认具体策略；用测试证明有界执行、停止原因可追溯、失败不会丢失已取得证据。 | A；B、C 提供相应输入与验收样例。 |
| 超长论文分批抽取 | 2026-09-15 用户确认第一版超限暂停该论文并记录原因，其他论文继续；输入估算检查与模型接入已在库级实现并验证。 | 后续确认分批大小、原始段落编号映射、跨批证据合并和覆盖记录后再实现；不静默丢弃正文。 | A；B 配合片段定位验收。 |
| 哈希冲突的核对与继续处理 | 2026-09-15 确认：原因未明时暂停该论文，其他论文继续；记录冲突，不覆盖旧数据。规则详见[全文交接规则](academic-content-version-handoff.md)，单篇暂停返回已实现，记录保存与恢复尚未接入。 | 根据实际冲突样例确定人工核对及重新处理方式；确认内容变化则创建新版本，单纯格式差异不判为改版。能定位原因、明确处理结果并继续该论文，且保留历史证据后，再标记完成。具体自动化方案实施前由 A 确认。 | A；涉及解析原因时由 B 配合。 |

返回[团队文档索引](../00-团队文档索引.md)。
