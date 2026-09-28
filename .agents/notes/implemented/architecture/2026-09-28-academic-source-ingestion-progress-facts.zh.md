# Agent Note: 学术来源与摄取从各自包发布进度事实

Status: implemented

[English](2026-09-28-academic-source-ingestion-progress-facts.md) | 中文

## 问题

学术研究进度格式要携带逐 Provider 的检索活动和摄取计数，但所属包都没有提供。来源搜索只报告结算后的聚合结果，客户端无法知道哪个 Provider 正在运行、哪个失败以及原因。摄取只报告内部审计，进度消费方必须自行重新推导其含义才能使用。工作流也无法自己产生这些事实：发现阶段的扇出与去重决策位于来源包与摄取包内。

## 决策

`dsh-academic-source` 为 `searchAll()` 与 `searchProviders()` 增加可选的逐 Provider 观察者。在每个 Provider 真正发起请求的那一刻、尚未汇合本轮 await 之前发布 `started` 观察；结算后发布 `settled` 观察，携带该 Provider 的 `success`、`failed` 或 `cancelled` 结算、失败时的共享失败 `category`、返回成果数与截断标记。观察不带时间戳，由进度持有方打戳。观察者异常被吞掉，因为进度只用于观察，不能改变本轮结果。

`dsh-academic-ingestion` 增加 `summarizeIngestAudit()`，把一次 `IngestOutcome` 聚合为四个互不混用含义的计数：`mergedWorkIdentities` 来自 `merged_work`，`mergedVersionRecords` 来自 `merged_version`，`suspectedDuplicateRecords` 来自 `suspected_duplicate`，`retainedWorkVersions` 是本次结果最终保留的版本总数（`outcome.versions.length`），绝不是 `merged_version` 计数。

业务边界保持不变。`EvidenceGenerator` 维持 `(request) => Promise<EvidenceDraft[]>` 签名：模型分批与尝试事实仍属于工作流，由其分批与模型调用代码产生。Web 发现的识别与逐条核验实时事实属于调用纯识别器与 `verifyReference()` 的混合检索编排层；其返回值只携带终态，开始与终态事实由编排层发布。

## 考虑过的替代方案

**给 `EvidenceGenerator` 增加进度回调。** 不采用，因为分批序号、尝试次数与超时都发生在工作流的分批与模型调用层；证据库只能看到生成器对单篇论文的最终返回，此处的回调会报告其所在包无法观测的事实。

**只在 `Promise.all()` 返回后报告 Provider 结算。** 不采用，因为客户端无法显示某个 Provider 正在运行，慢 Provider 的开始会在整轮中不可见。

**把摄取事实合并为更少的计数。** 不采用，因为合并的成果身份、合并的版本记录、疑似重复与最终保留版本总数描述的是不同决策，合并为一个计数至少会误述其中一个。

**让进度协议拥有 Provider 观察类型。** 不采用，因为事实产生于来源包；来源包拥有其词汇，由工作流把它们映射进进度格式。

## 结果

工作流及其进度投影可以展示每个学术 Provider 的运行与终态以及摄取去重计数，而无需深入来源或摄取内部。来源包新增一个可选参数与一条隔离的观察路径；省略时保留所有既有调用与结果。摄取函数是纯函数，只读取传入的审计与版本。整轮聚合、`partial_success` 结论与面向用户的文案仍由工作流与客户端持有方负责。
