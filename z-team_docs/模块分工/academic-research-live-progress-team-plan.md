# 学术研究实时进度团队分工

## 状态与目标

本文记录学术研究运行期间的实时阶段展示分工。第一版让用户在页面打开期间看到当前阶段、运行耗时、已完成数量、当前论文、全文或证据分段以及有限重试状态；页面关闭或切换会话仍取消当前请求，后台持续运行和断点恢复不属于本轮范围。

进度展示不使用推测的总体百分比。生产方只发布已经发生的阶段、计数和状态，页面可以显示“已处理 7/15 篇”或“第 3/6 个分段”，不能根据等待时间估算完成比例。

## 固定阶段与状态

实时进度使用独立的 Academic 运行进度类型，不向现有粗粒度 `ResearchStage` 枚举加入检索、全文或证据等内部步骤。

| 阶段 | 用户含义 | 主要事实生产者 |
|---|---|---|
| `retrieval` | 学术来源检索、Web 发现和学术身份核验 | A 编排，B 提供来源结果 |
| `screening` | 去重、范围筛选和候选选择 | A 编排，B 提供摄取与去重事实 |
| `fulltext` | 获取并解析论文全文 | B |
| `extraction` | 从可定位全文抽取并验证证据 | B |
| `analysis` | 按研究问题形成跨论文洞察 | C 提供分析结果，A 编排阶段 |
| `report` | 合成报告并执行质量结算 | C 提供报告结果，A 编排阶段 |

每个阶段使用 `pending`、`running`、`partial_success`、`success`、`failed`、`cancelled` 或 `not_run`。运行终止时，未执行的下游阶段使用 `not_run`，不继续保留容易误解的 `pending`。后续阶段失败时保留已经完成阶段的事实；“模型已返回”不能代替“证据已验证”，“论文已处理”不能代替“论文已纳入”。

## 负责人 A：共享进度接口与编排

A 先完成共享接口，B、C 在接口合并后并行开发。A 不实现学术网站解析、证据语义或页面样式。

### A-P1：固定进度字段

**当前进度：已合并到 master。** A 定义公开阶段、状态、运行标识、事件时间、已运行时间、阶段计数、当前活动和最新事件字段，并为论文标识、全文状态、分段序号、尝试次数及证据计数保留字段。补充接口把 `mergedWorkIdentities`、`mergedVersionRecords`、`retainedWorkVersions` 和 `suspectedDuplicateRecords` 分开计数；论文活动同时携带 `AcademicWorkId` 与 `WorkVersionId`；检索阶段接受按 Provider 独立结算的活动。三篇论文并发时允许 `fulltext` 与 `extraction` 同时出现在 `activeStages`，`primaryStage` 只负责页面标题。固定 JSON 样例覆盖检索中、Provider 运行、三篇论文并发、证据重试、部分成功和报告生成。B、C 不建立同义字段。

### A-P2：工作流阶段结算

**当前进度：阶段编排与全部已定义细粒度事实接线已完成。** `academic-workflow` 通过可选 `onProgress` 发布完整运行内快照；检索、筛选、全文、证据、分析和报告在真实调用点开始、更新和结算。Controller 的搜索适配器把观察器传给 Academic Source，工作流为每个 Provider 的开始、成功、失败或取消事实补充查询位置和时间，并映射为 Provider 活动。每条查询在开始前携带已批准的学术来源与 Web 发现渠道，Web 失败不会留下空渠道。混合检索编排器分别发布 Web 发现、汇总引用识别与逐条引用核验事实；核验活动带从一开始的位置和总数。工作流直接使用摄取包的 `summarizeIngestAudit()` 填写四类独立计数，避免重复解释审计记录。全文获取把 B-P2 的逐候选事实映射为 `fulltext_fetch`、`waiting_retry` 和 `fulltext_parse`，使用候选位置填写尝试次数，并在整轮取消前发布论文取消事实。证据阶段发布批次位置、已持久化的模型尝试、有限重试、超时、输出限制和来源核验计数；不扩展 B 的 `EvidenceGenerator` 请求或返回类型。报告生成在真实调用点依次发布 `evaluation` 与 `rendering`，模型综合继续归入分析阶段。三篇论文分别保留活动，单篇失败保留其他论文与合格证据，取消保留此前提交的计数。订阅者异常不会中断研究。

A 在 `academic-workflow` 中发布阶段开始、更新和结算事件。检索、筛选、全文、证据、分析和报告按真实调用顺序更新；并发论文分别保留状态，部分失败不清空其他论文和已验证证据。取消事件保留取消前已经提交的进展。

### A-P3：Controller 实时传输

**当前进度：已完成并由 C 的 Web 页面接入。** `academicResearch.runStream` 在一次 Remote 流内发送完整进度快照和唯一最终结果；一条流只启动一个维护任务。关闭流、切换会话或调用方取消会中止同一任务，不会自动重连或重启。原一元 `run` 暂时保留，避免其他调用方失效。

A 在 Academic Controller 中使用 DSH 现有 Remote 流能力传输进度和最终结果。同一次用户操作只启动一个研究运行；连接或订阅变化不得重复启动工作流。第一版沿用页面关闭、切换会话或用户取消时中止请求的生命周期，运行恢复另行设计。

A 的主要目录：

```text
packages/academic/model/
packages/academic/workflow/
packages/api/academic-research-controller/
```

## 负责人 B：检索、全文与证据进度事实

B 在 A-P1 合并后提供来源与论文处理的内部事实，不决定页面文案或总体阶段。

### B-P1：来源与筛选事实

B 在 `AcademicSourceRuntime.searchAll()` 与 `searchProviders()` 增加可选、运行内的 Provider 观察者。每个实际发起的学术 Provider 在请求开始时发布一次 `started`，随后恰好发布一次 `success`、`failed` 或 `cancelled` 结算；零结果属于成功。观察者异常不得影响搜索结果，事实不带时间戳，由 A 接收时记录。该观察者只覆盖直接学术 Provider，不覆盖 `web_discovery`。摄取包提供纯函数统计 `mergedWorkIdentities`（`merged_work` 条目数）、`mergedVersionRecords`（`merged_version` 条目数）、`retainedWorkVersions`（`outcome.versions.length`）和 `suspectedDuplicateRecords`（`suspected_duplicate` 条目数）。不得把 `merged_work` 命名为 `mergedWorkRecords`，因为该审计项表示被合并的身份，不表示输入记录数。

### B-P2：全文与证据事实

**当前进度：B 的逐候选全文事实与 A 的全文、证据模型映射已完成。** 候选开始、成功、失败和取消事实已经接入论文活动；A 的模型适配层已经接入分段、尝试、超时、输出限制、有限重试和来源核验计数。

B 为每篇论文提供全文获取、解析、证据抽取和证据验证结果。B 保持现有 `EvidenceGenerator` 接口，不为工作流进度增加回调或改变返回类型。长论文分段、尝试与重试事实由 A 在工作流模型适配层根据已有批次及调用记录映射到进度；B 的结果继续提供机器可读失败原因，C 负责面向用户的中文说明。

Web 发现、引用识别和逐条核验由 A 的混合检索编排层生产实时事实。A 在真正调用 `searchWeb()` 或 `verifyReference()` 前发布运行事实，在操作结算后发布终态；同步的 `identifyAcademicReferences()` 完成后发布识别计数。B 不给 `verifyReference()` 增加观察者，避免 Academic Source 同时承担 Web 编排和进度协议职责。

B 的主要目录：

```text
packages/academic/source/
packages/academic/source-*/
packages/academic/ingestion/
packages/academic/evidence/
```

## 负责人 C：分析、报告与 Web 展示

C 可以在 A-P1 的固定 JSON 样例合并后开发页面，不等待真实模型运行完成。

### C-P1：阶段展示

C 在学术研究页面顶部展示当前阶段和已运行时间，并按固定顺序保留六个阶段的状态。页面不得从论文数组推断阶段成功，也不得把等待时间换算为总体百分比。

### C-P2：当前工作与最近进展

C 展示当前查询、当前论文、全文状态、证据分段、重试次数、成功与失败计数。最近进展使用有界列表；三篇论文并发时分别显示，不能只保留最后一个完成项。

### C-P3：终态衔接

C 在流返回最终结果后切换到现有报告、覆盖统计和失败明细。部分成功、失败、取消和有限报告使用不同文案；断流时说明连接状态，不能把断流显示为研究失败或重新启动研究。

C 的主要目录：

```text
packages/academic/analysis/
packages/academic/report/
packages/academic/eval/
packages/client/ui-academic-research/
```

## 实施与合并顺序

1. A 合并 A-P1 的共享字段、Remote 帧定义和固定 JSON 样例。
2. B 实现 B-P1、B-P2，C 使用固定样例实现 C-P1 至 C-P3；两者可以并行。
3. A 完成 A-P2、A-P3，并接入 B 提供的细粒度事实。
4. C 拉取正式 Remote 流接口，替换固定样例并完成页面接线。
5. A 使用真实研究运行完成集成验收，统一更新正式产品文档和开发记录。

`packages/academic/model/**`、`packages/academic/workflow/**` 和 Academic Controller 默认由 A 修改；B 不修改工作流或 Controller，C 不修改 Provider、摄取和证据包。根配置、锁文件、正式总体计划和 Preset 由 A 统一处理。

## 第一版验收标准

1. 页面按真实顺序显示“论文检索 → 筛选与去重 → 全文获取 → 证据抽取 → 洞察分析 → 报告生成”。
2. 每个阶段都能显示待开始、运行中和终态，已完成阶段在后续失败后仍然可见。
3. 三篇论文并发时，页面能分别显示每篇论文的当前处理状态。
4. 长论文证据抽取能显示当前分段、总分段、尝试次数、超时和已验证证据数。
5. 单个来源、论文或分段失败时保留其他成功结果，并将阶段结算为部分成功或失败。
6. 网络断流、用户取消和服务器失败具有不同状态；重新连接或重新订阅不能重复启动研究。
7. 运行结束后，阶段统计与现有 Remote 最终结果、报告限制和失败明细一致。
8. 自动化场景覆盖正常完成、部分成功、连续超时、取消和无有效证据，并使用真实 Web 流程完成一次人工验收。

## 后续工作

后台持续运行、关闭页面后重新进入、跨进程恢复、已完成论文的断点续跑和动态总体百分比需要独立的运行持久化设计，不作为实时阶段展示第一版的完成条件。
