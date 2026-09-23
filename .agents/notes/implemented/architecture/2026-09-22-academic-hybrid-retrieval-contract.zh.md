# Agent Note: Academic 混合检索分离发现与核验

Status: implemented

[English](2026-09-22-academic-hybrid-retrieval-contract.md) | 中文

## 问题

Academic 工作流已经有 Provider 中立的多学术源检索路径，但加入通用 Web 搜索会形成不同的可信边界。Web 结果可以指向论文，却不能证明论文身份、元数据、版本或全文。B 需要稳定的引用识别与核验输入，C 需要浏览器安全的阶段和计数；如果不先固定这些字段，两边会各自创建重叠接口。

## 决策

共享契约区分 `academic` 与 `web_discovery` 渠道。每条检索可选的 retrieval 策略分别列出直接检索的 Academic Provider 与引用核验 Provider，并携带独立的 Web 发现和引用核验上限。该字段保持可选，使第 1、2 版计划维持原有行为；字段缺失表示没有获批混合策略，不表示观察值为零。第 3 版计划依据[已批准计划决策](2026-09-21-academic-approved-plan-search.zh.md)要求并校验该策略。

Web 发现产生 `AcademicWebDiscoveryCandidate`。纯识别器将其转换成 DOI、arXiv 或带 ACL/PMLR/CVF 命名空间的 Provider Record 引用，同时保留原始发现 URL。识别结果会在同批问题旁保留成功引用；被丢弃的候选至少携带一条 `unrecognized_page`、`invalid_reference` 或 `ambiguous_reference` 问题，不能只返回无说明的空数组。识别阶段不执行网络可信判断。Provider 可以实现 `verifyReference()`，把单条受支持引用解析成既有 `AcademicSourceWork`；权威来源确认无记录时返回 `null`，传输或解析失败则抛出，供后续分类结算。公共结果字段保留已核验成果/全文或单条不含凭据的分类失败。Web 标题、摘要片段与生成式回答绝不成为证据。

可选的 `hybridRetrieval` Remote 投影携带由生产方结算的学术检索、Web 发现、引用识别、引用核验与去重阶段。直接发现记录、Web URL、引用、核验尝试、核验成功/失败、丢弃引用、合并重复与去重论文保持不同计数单位。每条浏览器安全引用保留类型、规范值、发现 URL、核验 Provider、状态和清理后的消息。

固定合成夹具覆盖 DOI、arXiv、ACL、PMLR 与 CVF 引用，包括没有 DOI 或 arXiv ID 的官方记录。标识原始写法必须能从候选输入中还原；规范化不能创造候选中不存在的大小写。夹具还覆盖三种识别问题、一条核验成功、一条分类失败和浏览器投影。计划会为第 3 版交接填充策略。工作流的 `executeHybridSearch()` 同时启动获批的学术源发现和 Web 发现，执行精确引用去重、Provider 白名单与核验预算，只返回直接发现或核验成功的论文及彼此分离的渠道观察值。在 Academic Source 提供单次调用的 Provider 操作且 A-H4 投影这些观察值前，Controller 仍拒绝第 3 版计划运行。

## 考虑过的替代方案

**把每个 Web 结果直接视为论文。** 未采用，因为搜索摘要不能确立学术身份或证据溯源。

**只支持 DOI 与 arXiv 引用。** 未采用，因为有效的 ACL、PMLR 与 CVF 官方记录不一定暴露这两类标识。

**把任意 URL 用作全局成果身份。** 未采用，因为等价 URL 形式不同，来源内部记录需要命名空间；跨来源合并仍需已核验标识或对应关系。

**立即把混合字段设为必填。** 未采用，因为既有已批准计划和 Remote 消费方仍是单通道。可选字段允许 B、C 先依据固定契约开发，再由 A 在后续增量中加入计划校验与执行。

## 结果

B 可以实现引用解析与权威 Provider 定位，无需修改工作流或客户端类型。C 可以用固定夹具开发确定性的无网络展示，无需从聚合计数反推阶段。A 继续负责计划校验、编排、结算与 Remote 字段填充。

完全一致且已经核验的 DOI、arXiv 标识和同一 Provider 的记录 ID 可以支持去重。标题、作者、年份或普通发现 URL 的相似性仍只产生审计候选，不自动合并。仅有接口基线不代表生产环境已经支持混合检索。
