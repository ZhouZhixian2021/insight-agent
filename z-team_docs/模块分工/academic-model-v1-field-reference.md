# Academic Model v1 字段规范

## 1. 文档状态与用途

本文档是 Academic Model v1 的已批准设计规范，供成员 A、B、C 在独立开发时统一字段语义、数据归属和失败处理。本文档描述待实现的数据设计，不表示相关类型、存储或运行逻辑已经进入源码。

成员 A 维护本规范。成员 B 按本规范产出论文、版本、证据、EvidenceCard 和覆盖统计。成员 C 读取成员 B 的结果并产出跨论文 Claim、证据关系和评估。字段语义需要调整时，应先更新设计并通知另外两名成员，不能在各自代码中创建含义不同的同名字段。

本文档中的字段清单用于表达数据结构。实际实现仍需遵守仓库的品牌 ID、Session 事件、单调 Schema 版本和插件扩展规则。

## 2. 全局规则

所有跨模块、持久化和进入 Session 日志的内部 ID 都使用不透明的品牌 ID。内部 ID 随机生成；外部数据库编号单独保存并通过规范化映射参与去重。每一种持久化对象拥有自己的单调递增 schemaVersion；读取方遇到未知新版本时必须明确拒绝或升级，不能静默降级。

任何发送给模型的 Brief、证据、Claim 上下文或报告输入都必须能从 Session 日志重建。日志至少记录实际使用的对象 ID、对象版本和内容哈希。

论文日期允许只精确到年或月；系统运行、审核和评估时间使用完整 UTC ISO 8601 时间。系统不能把未知的月或日自动补成看似真实的日期。

## 3. AcademicWork、WorkVersion 与外部标识符

### 3.1 AcademicWorkId

AcademicWorkId 表示同一学术成果的稳定内部身份。一篇论文从预印本发展为正式发表版本时仍属于同一个 AcademicWork。

- ID 为内部随机 ID。
- DOI、arXiv ID、OpenAlex ID 等外部编号不充当 AcademicWorkId。
- 去重模块可以把多条来源记录映射到同一个 AcademicWorkId，但必须保留映射依据。

AcademicWork 的 v1 字段：

- academicWorkId：同一学术成果的内部 ID。
- schemaVersion：AcademicWork 数据结构版本。
- title：规范化展示标题。
- authors：规范化作者列表，并保留可用的来源写法。
- externalIdentifiers：该成果的外部标识符列表。
- workVersionIds：已知内容版本 ID 列表。
- canonicalVersionId：报告展示和正式引用采用的版本。
- firstPublicDate：首次公开日期，使用 Availability<PartialDate>。
- publicationStatus：预印本、已录用、已出版、已更正、已撤回或未知状态。
- venue：期刊、会议或平台信息，使用 Availability。

### 3.2 WorkVersionId

WorkVersionId 表示一份不可变的论文内容版本。同一个 AcademicWork 可以有预印本、录用稿、正式出版版、修正版或撤稿标记版本。

- WorkVersionId 为内部随机 ID。
- 摘要或正文内容发生变化时创建新的 WorkVersionId。
- 只修正不影响学术内容的元数据时可以保留 WorkVersionId。
- 旧版本不能覆盖、删除或重新分配给另一份内容。
- EvidenceRecord、EvidenceCard 和 EvidenceSnapshot 记录实际使用的 WorkVersionId。
- AcademicWork 的 canonicalVersionId 指向展示和正式引用采用的版本，通常优先正式出版版本。
- 实际证据可以来自可访问的最新有效预印本，但必须保留版本、勘误和撤稿状态。

WorkVersion 的 v1 字段：

- workVersionId：不可变内容版本的内部 ID。
- schemaVersion：WorkVersion 数据结构版本。
- academicWorkId：所属 AcademicWork。
- versionType：preprint、accepted_manuscript、version_of_record、corrected、retracted 或 unknown。
- versionLabel：来源提供的版本名称，使用 Availability。
- releaseDate：该版本公开或修订日期，使用 Availability<PartialDate>。
- externalIdentifiers：该版本直接关联的外部标识符。
- sourceRecords：发现该版本的 Provider 记录引用。
- contentHash：摘要或正文内容哈希；没有稳定内容时使用 Availability。
- supersedesWorkVersionId：该版本明确替代的旧版本；不存在时为 null。
- status：active、corrected 或 retracted。

### 3.3 ExternalIdentifier

字段：

- kind：标识符类型，例如 doi、arxiv、openalex 或 pubmed。
- normalizedValue：规范化后的值，用于查询、匹配和去重。
- originalValue：数据源返回的原始值，用于展示和追溯。
- sourceProvider：提供该值的数据源。

去重键为 kind + normalizedValue。例如原始 DOI https://doi.org/10.1234/ABC 可以规范化为 10.1234/abc。规范化只能消除明确的格式差异，不能仅凭相似标题合并标识符。

## 4. Availability

Availability<T> 区分字段当前有值、来源未知、不适用、尚未抽取和抽取失败。

- available：必须包含 value。
- unknown：必须包含 reason，表示来源没有提供该信息。
- not_applicable：必须包含 reason，表示字段不适用于当前论文或条目。
- not_extracted：可以包含 reason，表示信息可能存在但当前流程尚未抽取。
- failed：必须包含 failureId 和 reason，表示系统尝试抽取但失败。

Availability 只说明可用状态，字段自己的数据全部放在 value 中。核心字段使用 Availability；纯展示字段可以保持可选。生产者不能用空字符串、零或空对象代替不可用状态。日期字段的 value 可以保存 iso 和 precision，而不能把 iso、precision 放到 Availability 外层。

## 5. ResearchBrief

ResearchBrief 是用户审核通过的一次研究约束。检索、证据抽取、跨论文分析和报告生成必须引用同一个已批准版本。

- researchBriefId：同一次研究目标的稳定内部 ID。
- schemaVersion：ResearchBrief 数据结构版本。
- version：Brief 内容版本，从 1 单调递增。
- topic：研究主题的主名称。
- aliases：技术别名、缩写和常见写法，用于扩展检索。
- questions：报告必须回答的研究问题。
- publicationWindow：论文纳入时间范围。
- includedWorkTypes：允许的成果类型。
- inclusionRules：满足哪些条件才纳入分析。
- exclusionRules：命中哪些条件必须排除。
- evidenceRequirements：最低证据质量和数量要求。
- targetAudience：报告面向的读者。
- reportRequirements：语言、篇幅、章节和引用要求。
- stopConditions：检索与处理的资源上限和停止标准。
- assumptions：用户没有明确提供但计划采用的假设。
- approval：人工审核状态和审核记录。

任何实质修改都创建新的 Brief 版本并重新审核。Agent 只能执行当前已批准版本。普通追问不自动创建新计划；只有研究范围、问题、证据要求或输出要求发生实质变化时才进入新的审核流程。

### 5.1 PublicationWindow 与 PartialDate

PublicationWindow 包含 start、end 和 dateBasis。start、end 使用 PartialDate 或 null；null 表示该方向不限制。dateBasis 取 published 或 first_public_release。

PartialDate 的 iso 保存真实已知部分，例如 2025 或 2025-06；precision 取 year、month 或 day。学术前沿研究默认建议采用 first_public_release，以免遗漏预印本。用户明确要求正式发表论文时采用 published。日期范围判断与 canonicalVersionId 的选择相互独立。

### 5.2 EvidenceRequirements

- minimumIncludedWorks：最终至少纳入的有效论文数量。
- minimumFulltextWorks：至少取得全文的论文数量。
- minimumEvidenceLevel：abstract 或 fulltext，表示实质性学术结论所需的最低证据层级。
- requireLocatableEvidence：证据是否必须能定位到摘要、章节、页码、段落、表格或图片。
- allowPreprints：是否允许预印本进入分析。
- insufficientEvidencePolicy：continue_with_warning 或 stop_for_review。

数量不作为全局固定值。Plan 根据主题宽窄生成建议值，用户批准后固定在 Brief 版本中。元数据只能支持书目信息，不能支持方法、实验结果或学术结论。MVP 建议采用 continue_with_warning，但必须在报告中披露不足。

### 5.3 ReportRequirements

- language：报告语言，例如 zh-CN。
- targetLength：包含 unit、minimum 和 maximum；没有限制的一侧为 null。
- requiredSections：用户批准的必备章节。
- citationStyle：numeric 或 author_year。
- includeEvidenceAppendix：是否输出证据附录。
- includeMethodology：是否说明检索和筛选方法。
- includeLimitations：是否单列局限性。
- includeResearchGaps：是否输出研究空白。

建议章节值包括 executive_summary、scope_and_method、technology_overview、paper_landscape、cross_paper_analysis、key_findings、limitations、research_gaps 和 references。默认中文报告采用数字引用，并保留局限性和参考文献。

### 5.4 StopConditions

- maximumSearchRounds：最多检索轮次。
- maximumCandidateWorks：最多处理的候选论文数量。
- maximumIncludedWorks：最多深入分析的论文数量。
- maximumElapsedMinutes：最长运行时间；null 表示不按时间停止。
- saturationRounds：连续多少轮未发现新的有效论文后认为检索趋于饱和。
- stopWhenEvidenceRequirementsMet：满足证据要求后是否允许提前结束。

停止条件是资源上限，不证明检索完整。达到上限但证据仍不足时，CoverageSummary 必须记录截断和限制。扩大范围需要创建新的 Brief 版本并重新批准。

### 5.5 BriefApproval

BriefApproval 是区分联合类型：

- pending：等待用户审核。
- approved：包含 reviewedBy、reviewedAt、approvedBriefVersion 和可空 comment。
- revision_requested：包含 reviewedBy、reviewedAt、reviewedBriefVersion 和必填 comment。

reviewedBy 标识审核人，reviewedAt 使用完整 UTC 时间，版本字段明确审核对象。旧审核记录必须保留，不能用新状态覆盖历史。

## 6. RetrievalRun、ResearchStage 与 EvidenceRecord

### 6.1 RetrievalRun

RetrievalRun 记录一次按已批准 Brief 执行的检索。成员 A 的工作流创建运行记录，成员 B 填写查询、数据源结果、论文引用、覆盖统计和逐项失败。

字段：

- retrievalRunId：检索运行内部 ID。
- schemaVersion：RetrievalRun 数据结构版本。
- researchBriefId 和 researchBriefVersion：本次运行使用的 Brief。
- stage：六阶段 ResearchStage。
- startedAt 和 completedAt：完整 UTC 时间；未完成时 completedAt 为 null。
- queries：实际执行的查询列表，包括查询文本和执行顺序。
- providers：实际调用的数据源列表。
- academicWorkIds：去重后纳入本次运行的工作 ID。
- coverageSummary：本次运行的覆盖统计。
- failures：本次运行的 ProviderFailure 列表。

ResearchStage 固定为 planning、awaiting_approval、running、completed、failed 和 cancelled。running 内部的检索、证据构建、分析和报告步骤通过独立进度信息表达，不继续增加顶层阶段。

### 6.2 EvidenceRecord

EvidenceRecord 保存一条可定位、可追溯的原始证据和带来源陈述。

字段：

- evidenceId：证据内部 ID。
- schemaVersion：EvidenceRecord 数据结构版本。
- academicWorkId 和 workVersionId：证据所属成果及实际内容版本。
- level：metadata、abstract 或 fulltext。
- verbatimExcerpt：可定位原文，使用 Availability<string>。
- sourcedStatement：生产者根据原文形成的结构化陈述。
- sourceLocatorId：SourceLocator 引用。
- sourceProvider 和 sourceUrl：证据来源。
- retrievedAt：完整 UTC 获取时间。
- contentHash：证据所依据内容的哈希，使用 Availability。
- extractionMethod：规则、解析器或模型抽取方法及版本。
- qualityNotes：影响使用范围的质量提示。

结构化陈述不能替代原文。metadata 级证据只能支持作者、标题、日期和场所等元数据陈述。无法取得原文时必须记录 Availability，不得生成伪造片段。

## 7. SourceLocator

SourceLocator 说明 EvidenceRecord 的原文位置。v1 支持 provider_record、abstract、page_section、paragraph、table 和 figure 六种类型。

公共字段包括 sourceLocatorId、schemaVersion、workVersionId、kind 和可空 contentHash。各类型补充字段如下：

- provider_record：数据源名称、来源记录 ID 和 URL。
- abstract：摘要字符起止位置。
- page_section：章节标题、PDF 文件页码和印刷页码。
- paragraph：章节和段落序号。
- table：表格编号、标题和页码。
- figure：图片编号、标题和页码。

PDF 文件页码与论文印刷页码必须分开。找不到可靠位置时明确记录不可定位状态，不能编造页码。内容哈希变化时，旧定位和依赖它的 Claim 需要重新验证。

## 8. EvidenceCard

EvidenceCard 是成员 B 为单篇 WorkVersion 生成的结构化证据摘要。公共字段包括 evidenceCardId、schemaVersion、academicWorkId 和 workVersionId。

六个固定分区为 researchQuestions、methods、datasets、metrics、findings 和 limitations。每个条目都包含：

- evidenceCardItemId：卡片内部条目的稳定 ID。
- statement：根据原文形成的简洁陈述。
- evidenceIds：直接支持陈述的一条或多条 EvidenceRecord。

分区附加字段：

- ResearchQuestionEntry：questionType，可取 descriptive、comparative、causal、exploratory 或 other。
- MethodEntry：methodName 和 methodRole；角色可取 proposed、baseline、evaluation、analysis 或 other。
- DatasetEntry：datasetName、version、split 和 scale。
- MetricEntry：metricName、value、unit、direction 和 evaluationContext；direction 可取 higher_better、lower_better 或 context_dependent。
- FindingEntry：findingType 和 conditions；类型可取 primary、secondary、negative、null_result 或 other。
- LimitationEntry：limitationType；可取 data、method、evaluation、generalizability、author_stated 或 other。

附加字段使用 Availability。没有证据支持时不创建条目；分区空数组表示没有取得证据支持的条目。成员 B 不能用自由推断填充 statement。指标必须保留评估条件，避免成员 C 脱离实验设置比较数值。

## 9. CoverageSummary

- discoveredRecords：数据源返回的原始记录总数。
- deduplicatedWorks：去重后的 AcademicWork 数量。
- includedWorks：筛选后实际进入分析的论文数量。
- availableFulltextWorks：获得全文的论文数量。
- abstractOnlyWorks：只能获得摘要的论文数量。
- metadataOnlyWorks：只能获得元数据的论文数量。
- failedOperations：检索、获取或解析失败的操作数。
- truncated：是否因时间、数量、数据源或权限限制提前截断。
- limitations：覆盖范围限制的可读说明。
- providerBreakdown：各数据源分项统计；MVP 可以为 null。

成员 B 根据真实运行记录填写，模型不能估算这些数字。truncated 为 true 时 limitations 不能为空。成员 C 和报告层用该记录限制结论强度。

## 10. ProviderFailure 与 BatchResult

ProviderFailure 字段：

- failureId：失败记录内部 ID。
- provider：发生失败的数据源或服务。
- operation：检索、抓取全文或解析等具体操作。
- category：invalid_request、authentication_failed、rate_limited、timeout、network_error、upstream_error、not_found、parse_failed、fulltext_unavailable 或 unknown。
- message：不含凭据的可读说明。
- retryable：该失败是否值得自动重试。
- retryAfter：建议重试时间；没有则为 null。

BatchResult<T> 包含 status、items 和 failures。全部成功为 success；部分项目成功为 partial_success；没有有效结果为 failed。配置无效和认证缺失等整体错误应尽早终止。单篇全文不可用不能让其他成功论文作废。自动重试只能依据 retryable 和停止条件执行，不能无限重试。

## 11. Claim、证据关系与评估

### 11.1 ClaimRecord

- claimId：Claim 内部 ID。
- schemaVersion：ClaimRecord 数据结构版本。
- text：准备进入报告的跨论文结论。
- category：consensus、trend、comparison、disagreement、research_gap 或 limitation。
- scope：结论适用的论文范围和技术条件。
- uncertainty：不能确定或仍有争议的内容；没有则为 null。
- confidence：high、medium、low 或 insufficient。
- confidenceReasons：得到该等级的具体原因。
- evidenceSnapshot：形成结论时实际使用的证据快照。
- validity：current 或 stale。

confidence 是可解释等级，不是假装精确的数学概率。

### 11.2 ClaimEvidenceLink

字段包括 claimEvidenceLinkId、claimId、evidenceId、relation 和 rationale。relation 取 supports、contradicts 或 background；rationale 解释证据与 Claim 的关系。Claim 至少关联一条 EvidenceRecord。背景材料不能单独证明 Claim，反对证据也不能被省略。

### 11.3 ClaimAssessment

- claimAssessmentId：评估记录内部 ID。
- claimId：被评估的 Claim。
- status：supported、partially_supported、contradicted、unsupported 或 insufficient。
- reason：判断原因。
- method：评估方法。
- methodVersion：评估方法版本。
- assessedEvidenceIds：评估实际使用的证据。
- assessedAt：完整 UTC 评估时间。

成员 C 负责 Claim、ClaimEvidenceLink 和 ClaimAssessment。EvidenceRecord 的 WorkVersionId 与 Claim 创建时的版本不一致时，Claim 标记为 stale，不能进入报告。重新分析创建新记录，旧记录保留而不原地修改。

## 12. EvidenceSnapshot

EvidenceSnapshot 包含 evidenceSnapshotId、schemaVersion、researchBriefId、researchBriefVersion、evidenceItems 和 createdAt。每个 EvidenceSnapshotItem 包含 evidenceId、academicWorkId、workVersionId 和可空 contentHash。

Snapshot 创建后不可修改。重新分析必须创建新 Snapshot，不能覆盖旧 Snapshot。该记录确保模型看过的每条证据都能按 Brief、论文版本和内容哈希重建。

## 13. Session 与持久化职责

Session 日志保存 ResearchBrief 全部版本、审核记录、六阶段运行状态、详细进度、检索查询、检索轮次、CoverageSummary、ProviderFailure、模型实际使用的 EvidenceSnapshot、Claim、ClaimEvidenceLink、ClaimAssessment、报告生成过程和最终报告引用。

Evidence Store 保存 AcademicWork、WorkVersion、ExternalIdentifier、EvidenceRecord、EvidenceCard、SourceLocator、内容哈希、数据来源和获取状态。

PDF、HTML 全文、解析正文、表格和图片等大对象后续进入独立 Blob 或文件存储，并按内容哈希寻址。Session 与 Evidence Store 只保存可追踪引用，不直接嵌入大型原始文件。

## 14. 模块交接规则

成员 B 交付给成员 C 的最小批次结果包含 RetrievalRun、CoverageSummary、成功的 AcademicWork 与 WorkVersion、EvidenceRecord、EvidenceCard、SourceLocator，以及逐项 ProviderFailure。

成员 C 只基于明确版本的 EvidenceRecord 和 EvidenceCard 生成 Claim。成员 C 不覆盖成员 B 的单篇论文记录，也不能在缺少原始证据时补写 EvidenceCard。

成员 A 维护品牌 ID、Schema 版本、Brief 审核、Session 可重建性、版本陈旧判断和固定接口样例。成员 A 不替代成员 B 选择检索数据源，也不替代成员 C 决定跨论文分析方法。

## 15. v1 验收路径

最小闭环为：

    用户请求
      -> ResearchBrief
      -> 人工审核
      -> RetrievalRun 与 CoverageSummary
      -> AcademicWork 与 WorkVersion
      -> EvidenceRecord 与 SourceLocator
      -> EvidenceCard
      -> EvidenceSnapshot
      -> Claim 与 ClaimAssessment
      -> 报告

v1 验收至少证明：同一论文多个版本可以去重但不会混淆证据；部分数据源失败时成功结果仍能进入分析；每条跨论文 Claim 可以追踪到具体证据和版本；陈旧 Claim 不会进入报告。
