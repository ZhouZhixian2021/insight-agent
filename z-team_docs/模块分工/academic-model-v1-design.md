# Academic Model v1 共享数据设计草案

## 文档状态

| 项目 | 内容 |
|---|---|
| 负责人 | A，`ZhouZhixian2021` |
| 日期 | 2026-09-09 |
| 状态 | A-01 至 A-12、字段语义和存储职责已确认，尚未创建源码包 |
| 输入 | B 的检索与证据需求、C 的分析与产品需求、现有 Research Brief |
| 决策方式 | A 与项目主负责人逐项确认；B、C 的需求作为设计输入，不作为阻塞性审核 |

本文整理 `academic-model v1` 已确认的公共数据规则。详细字段含义、生产者、消费者和异常规则见[字段规范](academic-model-v1-field-reference.md)。本文不定义已发布 API，不授权创建 `packages/academic/model`，也不表示 B、C 的业务模块已经实现。

## 设计目标

`academic-model` 只保存跨模块共享的数据类型、稳定标识和版本信息。B 的 Provider、摄取和证据实现，C 的分析、报告、评测和 UI 实现均不得进入该包。

```text
ResearchBrief
  → RetrievalRun + AcademicWork + WorkVersion
  → EvidenceRecord + EvidenceCard
  → ClaimRecord + ClaimEvidenceLink
  → ClaimAssessment + ReportArtifact
```

## 已确定的规则

1. 公共数据不包含 OpenAlex、Crossref、arXiv 等 Provider 的原始响应类型。
2. 同一研究工作与它的预印本、修订版、正式出版版分开标识，避免重复计数并保留实际使用版本。
3. 内部标识与 DOI、arXiv ID、OpenAlex ID 等外部标识分开保存。
4. 证据等级至少区分 `metadata`、`abstract` 和 `fulltext`；证据等级只表示材料范围，不表示研究质量或结论可信度。
5. 论文、证据、结论和评测通过稳定 ID 关联，不通过展示标题或数组位置关联。
6. Claim 与 Evidence 使用多对多关系，关联性质至少区分支持、反对和背景。
7. 搜索无结果属于成功但结果为空；运行失败、部分成功和完整成功必须可以区分。
8. 缺失信息不得由模型猜测或用默认值伪装成真实数据。
9. 结论置信度必须包含可解释理由，不把模型自行给出的百分比当作已校准概率。
10. 公共数据必须可序列化，并为后续 Session 记录、持久化和恢复保留明确版本。

## v1 候选公共对象

| 对象 | 用途 | 主要生产者 | 主要消费者 | v1 状态 |
|---|---|---|---|---|
| `ResearchBrief` | 保存人工批准的研究范围和交付约束 | Academic 计划流程 | 工作流、检索、分析、报告 | 字段、版本和审核规则已确认 |
| `AcademicWorkId` | 标识同一研究工作 | 摄取与去重 | 证据、分析、报告 | 名称已确认 |
| `WorkVersionId` | 标识一个具体预印本、修订版或出版版 | 摄取与去重 | 证据、引用、复核 | 名称与不可变版本规则已确认 |
| `ExternalIdentifier` | 保存 DOI、arXiv、OpenAlex 等外部标识 | Provider 与摄取 | 去重、引用、报告 | 字段与去重键已确认 |
| `AcademicWork` | 保存跨版本论文身份和书目信息 | 摄取与去重 | 证据、分析、报告 | v1 最小字段已确认 |
| `WorkVersion` | 保存具体版本的日期、状态、来源和标识 | 摄取与去重 | 证据、引用、复核 | 引用版本与证据版本规则已确认 |
| `Availability<T>` | 显式表达值、未知、不适用、未提取和失败 | B、工作流 | C、报告、评测 | 五状态字段结构已确认 |
| `EvidenceLevel` | 限定证据能够支持的陈述范围 | 证据模块 | 分析、报告、评测 | 三个基础值已确定 |
| `SourceLocator` | 定位 URL、章节、页码、段落、表格或图 | 证据模块 | 分析、报告、人工审核 | 六种定位类型已确认 |
| `EvidenceRecord` | 保存一条可定位、可追溯的证据 | 证据模块 | 分析、报告、评测 | 内容字段已确认 |
| `EvidenceCard` | 保存一篇工作的结构化研究问题、方法、数据集、指标、发现和局限 | 证据模块 | 分析 | B 生产，C 消费；六分区已确认 |
| `RetrievalRun` | 保存一次检索的查询、Provider、范围和时间 | 工作流、检索模块 | 覆盖分析、恢复、审计 | A 创建，B 填写来源和统计 |
| `CoverageSummary` | 保存获取、过滤、失败、截断和全文可用情况 | 检索与证据模块 | 趋势、空白、报告限制 | v1 统计字段已确认 |
| `ProviderFailure` | 保存运行时来源失败及可重试信息 | Provider | 工作流、覆盖摘要 | 错误分类与重试字段已确认 |
| `BatchResult<T>` | 保存成功项与逐项失败 | 检索、摄取、提取 | 工作流 | 成功、部分成功和失败语义已确认 |
| `ClaimRecord` | 保存分析结论、类别、范围和限制 | 分析模块 | 报告、评测 | 字段、置信度与证据更新规则已确认 |
| `ClaimEvidenceLink` | 保存 Claim 与 Evidence 的支持、反对或背景关系 | 分析模块 | 报告、评测 | 关系类型与说明字段已确认 |
| `ClaimAssessment` | 保存结构检查、人工或模型辅助评测结果 | 评测模块 | 报告审核、发布流程 | 评估状态、方法和证据字段已确认 |
| `ResearchStage` | 保存研究运行阶段 | 工作流 | UI、恢复、报告 | 六状态精简集合已确认 |
| `ReportArtifact` | 标识报告输出及其所依据的运行和版本 | 报告模块 | UI、审核、后续导出 | 暂不进入首个 v1 纵向切片 |

## 建议的最小关系

```text
AcademicWorkId 1 ── n WorkVersionId
AcademicWorkId 1 ── n EvidenceRecord
WorkVersionId   1 ── n EvidenceRecord
ClaimRecord     n ── n EvidenceRecord 〔通过 ClaimEvidenceLink〕
RetrievalRun    1 ── 1 CoverageSummary
ClaimRecord     1 ── n ClaimAssessment
```

关系只说明标识关联，不预设数据库表、存储引擎或运行时服务。

## 第一版建议字段

### `ResearchBrief`

- 主题与别名。
- 研究问题。
- 发表时间范围与文献类型。
- 纳入和排除规则。
- 目标读者与分析深度。
- 本地材料范围。
- 来源与证据要求。
- 分析方法和报告格式。
- 停止条件和明确假设。
- Brief 版本及批准信息。

### `AcademicWork`

- 内部工作 ID。
- 标题和作者。
- 外部标识列表。
- 已知版本 ID 列表。
- 首次公开日期及日期精度。
- 当前发表状态和场所。
- 用于引用和报告展示的 `canonicalVersionId`。

### `WorkVersion`

- 版本 ID 和所属工作 ID。
- 版本类型与版本标签。
- 发布或修订日期及日期精度。
- 外部标识和来源记录。
- 内容哈希或版本指纹。
- 是否为当前首选版本。

### `Availability<T>`

- `available` 必须包含 `value`。
- `unknown` 必须包含 `reason`。
- `not_applicable` 必须包含 `reason`。
- `not_extracted` 可以包含 `reason`。
- `failed` 必须包含 `failureId` 和 `reason`。
- 包装层只表达可用状态；日期精度等字段自身的数据必须放在 `value` 内。

### `EvidenceRecord`

- 证据 ID、工作 ID 和实际使用版本 ID。
- 证据等级。
- 原文片段或结构化陈述。
- 原文定位。
- 来源 URL、Provider、抓取时间和内容版本。
- 提取方式与质量提示。
- 缺失或失败信息。

### `EvidenceCard`

- Evidence Card ID 和所属工作 ID。
- `researchQuestions`、`methods`、`datasets`、`metrics`、`findings` 和 `limitations` 六个固定分区。
- 每个分区条目关联一个或多个 `evidenceId`；没有受证据支持的条目时使用空数组。
- 条目内部的核心缺失信息使用 `Availability<T>`，不得由模型补造。

### `ClaimRecord`

- Claim ID 和完整结论文本。
- 结论类别与适用范围。
- 不确定性和限制。
- 置信度等级及其理由。
- 关联的 Claim–Evidence ID。
- 生成时使用的证据版本集合。
- 当前有效性状态。



## A 的决策记录

### A-01：工作标识名称

- 方案一：`PaperId`，名称直观，但容易把同一工作的不同版本误解为不同论文。
- 方案二：`AcademicWorkId`，明确表示跨版本研究工作，推荐。
- A 的决定：采用 `AcademicWorkId`。

### A-02：内部 ID 生成方式

- 方案一：随机 UUID，生成简单，不从外部字段推导。
- 方案二：对规范化外部标识生成确定性 ID，便于重复导入复用，但规则升级较复杂。
- 方案三：内部随机 ID 加独立去重映射，推荐；去重策略变化不会改变已发布 ID。
- A 的决定：采用方案三，内部随机 ID 加独立去重映射。去重规则变化不得改变已经发布的内部 ID。

### A-03：引用版本与证据版本选择

- 方案一：使用一个全局默认版本，同时用于引用和证据提取。
- 方案二：分别记录用于引用和报告展示的 `canonicalVersionId`，以及每条证据实际使用的 `WorkVersionId`。
- 方案三：不提供默认规则，由每次 Research Brief 决定。
- A 的决定：采用方案二。正式发表版本优先作为 `canonicalVersionId`；正式版本无法访问时，证据可以使用最新且有效的可访问作者稿或预印本，并记录实际版本。尚未正式发表的工作使用最新且未撤回的预印本。更正、勘误和撤回状态必须保留，撤回版本默认不得作为支持性核心证据。

### A-04：缺失值表达

- 方案一：字段使用 `null`，实现简单，但无法解释为什么缺失。
- 方案二：每个可缺失字段使用带状态的 `Availability<T>`，信息完整但类型较重。
- 方案三：核心字段使用 `Availability<T>`，展示性字段使用可选属性，推荐。
- A 的决定：采用方案三。核心研究字段使用 `Availability<T>`；展示性字段使用可选属性。`available` 必须包含 `value`；`unknown` 和 `not_applicable` 必须包含 `reason`；`not_extracted` 可以包含 `reason`；`failed` 必须包含 `failureId` 和 `reason`。包装层只表达可用状态，字段自身的数据全部放入 `value`。可选属性只表示该对象或视图不需要该字段，不得用来代替核心字段的缺失状态。

### A-05：Evidence Record 保存什么内容

- 方案一：只保存原文片段，结构化提取全部由 C 完成。
- 方案二：同时保存原文片段和带来源的结构化陈述，推荐。
- 方案三：只保存结构化陈述，体积较小但不利于人工核验。
- A 的决定：采用方案二。每条记录同时保存可定位的原文片段和带来源的结构化陈述；结构化陈述不得替代原文片段。`metadata` 级证据只能形成元数据范围内的陈述。无法取得原文时必须记录证据等级和缺失状态，不得生成伪造片段。

### A-06：Evidence Card 的生产责任

- 方案一：B 负责从单篇论文生成 Card，C 只做跨论文分析，推荐。
- 方案二：C 同时负责单篇论文提取和跨论文分析。
- 方案三：单独建立提取模块，第一版工作量较大。
- A 的决定：采用方案一。B 负责从单篇论文生成 `EvidenceCard`，C 负责消费 Card 并完成跨论文分析；`academic-model` 只定义共享数据，不负责生成 Card。`EvidenceCard v1` 固定包含研究问题、方法、数据集、指标、发现和局限六个分区。

### A-07：检索覆盖的归属

- 方案一：B 产生完整 `RetrievalRun` 和 `CoverageSummary`。
- 方案二：A 的工作流保存运行信息，B 只填写来源结果。
- 方案三：A 创建运行记录，B 填写来源和统计，推荐。
- A 的决定：采用方案三。A 的工作流创建 `RetrievalRun`，B 填写来源结果与 `CoverageSummary` 统计。

### A-08：结论置信度

- 方案一：`high`、`medium`、`low`、`insufficient`，并要求理由，推荐。
- 方案二：只保存理由，不提供等级。
- 方案三：数值概率；没有校准数据，第一版不建议。
- A 的决定：采用方案一。置信度使用 `high`、`medium`、`low`、`insufficient`，每个等级必须附带理由，不作为已校准概率使用。

### A-09：证据更新后的 Claim 状态

- 方案一：相关 Evidence 内容版本变化后立即标记 Claim 为 `stale`，重新评测后恢复。
- 方案二：系统保留旧 Claim，并在报告生成时检查证据版本。
- 方案三：直接删除旧 Claim，不利于审计和恢复。
- A 的决定：采用方案二的改良规则。系统不因证据更新而主动改写或删除旧 Claim；Claim 保存生成时使用的证据版本集合。报告、审核或其他消费方使用 Claim 前必须比较当前证据版本，版本不一致时将 Claim 视为 `stale`，不得进入最终报告，直至重新分析。

### A-10：第一版范围

- 方案一：一次性实现表中的所有对象，接口完整但交付较慢。
- 方案二：先实现标识、论文、版本、证据和失败结果；Claim、评测和报告对象随后补充。
- 方案三：实现 B→C 首个纵向切片所需的最小集合，推荐：标识、论文、版本、可用性、证据、覆盖、Claim 关联和批量结果。
- A 的决定：采用方案三。首个 v1 纵向切片包含标识、论文、版本、可用性、证据、覆盖、Claim 关联和批量结果；其他对象按消费需求后续加入。

### A-11：公共数据版本

- 方案一：每个持久对象独立携带 schema 版本，演进明确，推荐。
- 方案二：只为整个 Academic Model 设置一个版本。
- 方案三：第一版不带版本；不符合后续持久化和恢复目标。
- A 的决定：采用方案一。每个需要持久化的公共对象独立携带 schema 版本；版本只单调递增，读取端不得把未知新版本静默降级为旧版本。

### A-12：ResearchStage 第一版阶段

- 方案一：`brief_draft`、`awaiting_approval`、`approved`、`retrieving`、`building_evidence`、`analyzing`、`reporting`、`awaiting_review`、`completed`、`failed`、`cancelled`，信息详细但第一版状态较多。
- 方案二：仅保留 `planning`、`running`、`completed`、`failed`，实现简单但无法单独表达人工审批和主动取消。
- 方案三：采用 `planning`、`awaiting_approval`、`running`、`completed`、`failed`、`cancelled` 六个阶段；运行中的具体步骤通过独立进度信息表达。
- A 的决定：采用方案三。`awaiting_approval` 保留人工审批状态，`failed` 与用户主动触发的 `cancelled` 必须区分。

## 编码前完成条件

1. A-01 至 A-12 均已确认。
2. 每个进入 v1 的对象都有生产者、消费者和所有者。
3. A 维护[字段规范](academic-model-v1-field-reference.md)和一个包含版本重复、摘要证据、全文证据及部分失败的[固定 JSON 样例](../interface-samples/academic-model-v1/README.md)。
4. 固定样例包含基于检索与证据输出的 Claim、证据关联和评测期望。
5. A 验证 B 的样例输出能够直接被 C 的样例消费。
6. A 明确哪些对象进入 Session、哪些进入后续持久证据库，以及版本升级方式。
7. A 明确第一个源码 PR 的范围、测试和文档要求后，才创建 `packages/academic/model`。

## 暂不进入 v1

- OpenAlex、Crossref、arXiv 的原始响应字段。
- Provider 的网络实现和重试算法。
- 数据库表和共享部署方案。
- 趋势、冲突和研究空白的具体算法。
- DOCX/PDF 导出和专用 Web 页面字段。
- 多 Agent 调度、定时监测和跨课题证据复用。

返回[学术洞察模块总览](academic-module-ownership.md)。
