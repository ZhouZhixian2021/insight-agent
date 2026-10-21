# 学术洞察合成交接：A 的第一步

## 状态与范围

本文固定逐题洞察分析的输入输出与验收规则。对应 TypeScript API 已在 Academic analysis 导出，并接入正式 workflow 和报告生成。Remote 使用独立 synthesis 状态与原因。配套 JSON 仍是合成测试材料，不是真实论文摘录，不证明真实报告质量验收通过。

设计依据见[洞察分析决策](../../.agents/notes/implemented/architecture/2026-09-20-academic-question-synthesis.zh.md)。本交接复用 [ResearchBrief、EvidenceRecord、EvidenceCard 和 SourceLocator](../../packages/academic/model/src/types.ts)及 [ClaimRecord、ClaimEvidenceLink 和 ClaimAssessment](../../packages/academic/model/src/claims.ts)，不建立第二套论文、证据或全局 Claim 身份。

## 保留全文能力，补齐 Evidence → Insight → Report

现有来源检索、下载 HTML/PDF、正文解析、内容哈希、段落定位和逐篇证据抽取继续作为上游输入能力。本阶段不以重写抓取器、修改解析格式、自动查询规划或长论文分段为前提。来源网络故障继续独立归因，不能靠模型补造论文内容来绕过。

Evidence 阶段保留 B 的 EvidenceRecord、EvidenceCard、SourceLocator 和 WorkVersion。Insight 阶段接收这些对象及批准 Brief，产出逐问题回答、带证据关系的陈述和范围限制。Report 阶段消费已验证的 Insight 与原书目，按 Plan 生成文章、引用和证据附录，不自行检索、不额外创造学术论断。

第一条纵向切片以 Transformer 与 BERT 两个问题为目标：先完成逐题回答、机制说明、材料间联系、证据限制和参考文献。章节随已批准 Plan 确定；两篇论文不足以支持领域趋势或研究空白时，明确记录无法判断，不为了章节完整而强行生成这些结论。扩展方向地图、更多材料或分段抽取只能在这条路径验收后另行安排。

开发验证分两层：C 使用固定合成夹具验证字段、引用与失败行为；A/B 再提供经核验的真实论文证据进行内容验收。合成夹具不能证明报告真实有效。取得真实材料后应固定可重现的输入样本，供 Insight/Report 重复测试，避免每次测试都重新下载全文；样本存储沿用仓库测试与数据管理规则，保存真实运行证据不是本次文档交接已经实现的能力。

## 输入：AcademicSynthesisInput

输入由 A 在全文与证据核验完成后构造，C 消费；B 继续提供既有证据对象。模型只使用本次明确提供的材料。需要补查全文时由工作流另行调度，不能让合成模型把自身记忆当论文证据。

| 字段 | 精确类型或取值 | 生产规则 |
|---|---|---|
| `schemaVersion` | `1` | 本交接的文档级版本。 |
| `synthetic` | boolean | 测试材料必须为 true；不进入真实报告交付。 |
| `brief` | 既有 `ResearchBrief` | 完整传入已批准版本，包括问题、范围、受众及报告要求。 |
| `retrievalRunId` | 既有 `RetrievalRunId` | 关联本次真实运行，不由模型生成。 |
| `analysisInput` | 既有 `AnalysisInput` | 包含 `academicWorks`、`workVersions`、`evidenceRecords`、`evidenceCards`、`sourceLocators`，不缩减为仅有摘录的匿名文本。 |
| `coverageSummary` | 既有 `CoverageSummary` | 来自 A 的运行观察，模型不得估计或改写。 |
| `sourceFailures` | 既有 `ProviderFailure[]` | 运行失败的脱敏投影；保留失败和覆盖限制。 |

输入 JSON 见 [synthesis-input.sample.json](../interface-samples/academic-model-v1/synthesis-input.sample.json)。`questionIndex` 采用 `brief.questions` 中从 0 开始的数组位置；其身份由 Brief ID、版本和位置共同限定。修改或重排问题必须产生新的 Brief 版本并重新批准；第一版不增加全局 Question ID，也不要求 B 立即修改证据字段。

## 模型输出：AcademicSynthesisDraft

模型输出 JSON，不生成最终 Markdown、全局 ID、时间戳或审核结论。字段不允许省略，不接受未列出的键；空集合使用空数组，可缺值仅在下表明确允许时使用 null。

| 字段 | 精确类型或取值 | 校验规则 |
|---|---|---|
| `schemaVersion` | `1` | 必须匹配本次协议。 |
| `researchBriefId` | 输入的 Brief ID | 必须原样返回。 |
| `researchBriefVersion` | 输入的 Brief 版本 | 必须原样返回。 |
| `statements` | `StatementDraft[]` | 全部实质性论述放在这里；数组位置用于本响应内部引用。 |
| `questionAnswers` | `QuestionAnswer[]` | 每个问题恰好出现一次；顺序与输入一致。 |
| `sections` | `SectionDraft[]` | 按经支持性检查后的 Plan 章节顺序组织；必需章节不得静默遗漏。 |
| `limitations` | 非空字符串数组 | 仅解释输入缺失、覆盖和无法回答的问题，不能在这里夹带无引用的新科学结论。 |

`StatementDraft` 的字段固定为：`text: string`、`kind: 'source_statement' | 'synthesis'`、`category: ClaimCategory | null`、`scope: string`、`uncertainty: string | null`、`evidenceLinks: EvidenceLinkDraft[]`。text 和 scope 必须非空。source_statement 为单篇作者原意的归属陈述，category 必须为 null；synthesis 为需要审核的综合结论，category 使用现有 ClaimCategory 六值，不增加近似但不兼容的枚举。

`EvidenceLinkDraft` 的字段固定为：`evidenceId: EvidenceId`、`relation: 'supports' | 'contradicts' | 'background'`、`rationale: string`。每条陈述至少有一个 supports，保留矛盾证据及其解释，不能只用 background 证明结论。跨论文比较或综合至少关联两项独立 AcademicWork；单篇归属陈述不受两篇门槛限制。引用必须来自本次输入，且证据深度适用于所述结论。

`QuestionAnswer` 的字段固定为：`questionIndex: number`、`status: 'answered' | 'partial' | 'unanswered'`、`statementIndexes: number[]`、`reason: string | null`。answered 和 partial 必须引用非空陈述集合；unanswered 必须为空。partial 和 unanswered 必须说明原因，answered 的 reason 为 null。这些状态是模型提出的覆盖判断，C 的内容审核仍须判断是否真的回答了问题。

`SectionDraft` 的字段固定为：`sectionId: string`、`title: string`、`statementIndexes: number[]`、`missingReason: string | null`。标题非空，仅用于组织，不承载新事实；陈述索引均为本响应中合法的非重复整数。正文证据不足时该章节保留标题和 missingReason，不靠重复陈述填字数。references 和 evidence_appendix 由 C 直接从原始书目、证据和定位生成，索引为空且 missingReason 为 null；scope_and_method 的检索方法与覆盖数字由运行数据生成，不由模型编造。

输出 JSON 见 [synthesis-output.sample.json](../interface-samples/academic-model-v1/synthesis-output.sample.json)。A 保留模型原始响应并记录校验结果；C 校验后再用既有构造函数生成 Claim ID、ClaimEvidenceLink ID 和 EvidenceSnapshot。source_statement 可作为带证据引用的报告材料，不能冒充跨论文 Claim；synthesis 转换为 ClaimRecord，置信度及理由由 C 的既有分级规则产生。模型不得给自己生成 ClaimAssessment 或人工批准记录。

## Plan 支持性与报告生成门槛

第一版合成路径支持 `zh-CN`、`numeric` 和按字符计长。建议章节集合为 executive_summary、scope_and_method、technology_overview、paper_landscape、cross_paper_analysis、key_findings、limitations、research_gaps、references、evidence_appendix。现有 Plan 模板的 research_scope 和 directions 分别对应 scope_and_method 和 technology_overview；A 后续修正模板，并对旧计划显式记录对应关系。未知章节、未知工作版本类型或不支持的语言/长度单位，在联网前返回具体问题，不能静默删改已批准计划。

includeMethodology、includeLimitations、includeResearchGaps、includeEvidenceAppendix 为 true 时添加对应必需章节，和 requiredSections 取有序并集；false 仅表示不额外添加，不能删除 requiredSections 已明确要求的章节。正文长度计入摘要与分析正文，排除标题、参考文献、证据附录和运行失败清单；不得用重复引文或技术日志凑够字数。实际 2000—8000 字课题需要正文长度检查，固定 JSON 样例不冒充这一内容验收。

| 条件 | 合成与交付要求 |
|---|---|
| 0 条有效证据，或合格论文/全文低于 Brief 最低要求 | 不调用合成模型；返回运行摘要和明确缺项，`report: null`。保存已有成果，不冒充成功研究。 |
| 数量满足，但证据版本、定位或内容哈希不一致 | 拒绝这些材料进入合成；重新计算门槛并显示原因。 |
| 输入满足门槛 | 允许生成可审核草稿；不因此视为已回答问题或已获准交付。 |
| 模型 JSON 非法、Brief 不符或问题/章节引用越界 | 不生成报告；保存错误，不从损坏结构中猜测引用关系。 |
| 个别段落虚构 Evidence ID、仅有背景引用或字段无效 | 拒绝该段并记录原始序号、代码和原因；保留其他合格段落，重排引用，受影响问题降为部分回答或尚未回答。全部被拒才不返回报告。 |
| 必需问题/章节未回答，或正文长度未达到 Plan | 明确标注未满足项；有依据的部分草稿可保留，但不能标记为符合 Plan。 |
| 引用与版本均合法 | 只表示结构可追溯；语义是否支持须由 C 单独审核。 |
| 两篇论文未报告某事项 | 只能写“本次材料未覆盖”，不能据此断言全领域研究空白。 |
| synthetic 为 true，或没有有效语义审核记录 | 不得进入 final；模型不能自行宣称审核通过。 |

数量门槛按有合格证据的独立论文计算，不能只看下载成功数。coverageSummary 保留运行统计，不被模型覆盖；C/A 的输入核验从证据图检查可用论文和全文证据，交叉核对统计差异。

正式工作流执行上述准入与局部恢复规则。解析返回的 `rejectedStatements` 由主机生成，不属于模型 JSON 字段；序号为原始模型 statements 中从零开始的位置。Remote 的 `synthesis.status: partial_success` 保留草稿并提供拒绝原因，全部段落被拒时为 failed 且 report:null；检索统计不受洞察状态覆盖。`insufficientEvidencePolicy: continue_with_warning` 不授权降低准入门槛。调用预算与重试上限不因局部恢复而增加。

## 固定验收样例

[synthesis-cases.sample.json](../interface-samples/academic-model-v1/synthesis-cases.sample.json)定义准入、整份拒绝与局部恢复的可执行用例；[混合响应](../interface-samples/academic-model-v1/synthesis-partial-output.sample.json)验证合格段落保留和背景引用段落拒绝。解析、工作流及会话快照测试消费这些样例；通过不代表真实内容质量通过。

真实内容验收由 A、B、C 使用同一批准课题完成：两篇论文全文与证据通过核验；逐题回答 Transformer 长距离依赖与 BERT 双向预训练；关键事实有原文依据；证据缺口被明确披露；中文正文满足批准篇幅；所有要求有逐项结果。未通过时报告不能宣称符合 Plan。

## 分工与顺序

优先顺序由真实证据可用性决定：完成本次接口文档后，A/B 先稳定全文到有效 EvidenceRecord/EvidenceCard 的路径，再接入真实 Insight 和 Report。C 可以并行用固定材料实现分析与报告，但不得把合成夹具通过视为真实链路已通过。

证据阶段验收必须分别记录模型请求是否结束、JSON 是否有效、返回摘录数、逐字核验通过数、拒绝数和原因、最终可用论文数及问题覆盖。模型 JSON 校验通过不能替代抽取结果通过。以相同两篇真实全文至少连续三轮验证，记录模型配置、预算和每轮失败；三轮成功是本次回归信号，不保证所有论文或模型永不失败。失败必须明确结算，取消必须停止后续调用，单篇失败不得丢失其他论文成果。

实现顺序为：先区分来源网络失败与模型/摘录失败，并为可重现输入保留足够运行记录；再定位截断、无效 JSON、错定位或非逐字摘录的主要损耗；由 A/B 确认逐条保留合法证据和有界修正策略后实施。遇到材料不足时保持 Plan 门槛，不靠提高字数或模型补写填缺。分段抽取、额外调用和部分成功语义会影响成本与接口，需在具体方案明确后再安排。

| 成员 | 后续实现 | 可并行条件 |
|---|---|---|
| A | 把本交接落实为类型与支持性检查；复用 Session 模型接入合成、请求/结果记录、取消、预算及返回状态；日志记录全部模型可见材料和 Brief 版本。 | 本文与样例就绪后，和 C 确认消费接口，再接入正式调用。 |
| B | 修复来源可达性和精确查询；提高真实证据产量，保留来源、版本、逐字摘录和定位。 | 可独立推进；第一版合成不要求增加问题 ID 或改变证据接口。 |
| C | 按本文实现输入整理、提示与响应校验、问题驱动分析、Claim 映射、报告渲染、语义审核和 Plan 内容检查；调用模型仍由 A 的工作流承担。 | 先用 synthetic 固定样例完成模块开发，不必等 B 的网络恢复。 |

A 的本次交付是交接说明和样例；正式接口代码、模型调用、报告渲染及真实验收是后续工作。返回[成员 A 调用计划](member-a-academic-workflow-call-plan.md)。
