# 成员 A：Academic Model 实施计划

## 目标与边界

成员 A 负责把已确认的 `academic-model-v1` 设计实现为独立共享包 `packages/academic/model`。该包只定义稳定的学术业务数据类型和纯函数，不负责论文检索、单篇证据抽取、跨论文分析、报告界面或模型调用。

- A 独占维护 `packages/academic/model/**`。
- B 消费本包，实现单篇论文规范化与 EvidenceCard 产出。
- C 消费本包，实现跨论文 Claim、覆盖度和报告结构。
- B、C 发现接口缺失时提供输入样例、期望字段和失败场景，由 A 修改共享模型。

## 实施顺序

1. A1 基础包：不透明 ID、`Availability<T>` 五态类型、纯判定函数、包级文档和聚焦测试。
2. A2 学术成果：`AcademicWork`、`WorkVersion`、外部标识符、作者、日期、来源记录和去重规则。
3. A3 研究简报：范围、时间窗口、证据要求、报告要求、停止条件和人工批准状态。
4. A4 证据卡片：EvidenceCard 六分区、证据定位、抽取状态、质量评估和论文版本快照引用。
5. A5 分析输入：Claim、证据关系、冲突、置信评估、CoverageSummary、批处理结果和失败分类。
6. A6 持久化：解析校验、Schema 版本、相邻迁移、会话事件和必要的 SDK、快照更新。

## 并行协作

A1 合并后，B、C 可以建立各自目录并依赖基础类型。A 开发 A2、A3 时，B 准备提供方样例与适配测试，C 准备跨论文输入样例。A4 合并后 B 正式输出 EvidenceCard；A5 合并后 C 正式输出 Claim 和报告输入。

## 当前进度

- A1 已完成：独立包、不透明 ID、`Availability<T>` 五态和基础测试已经进入本地工作区。
- A2 已完成：`AcademicWork`、`WorkVersion`、外部标识符、版本关系和去重键已经进入本地工作区。
- A3 已完成：`ResearchBrief`、发表窗口、证据与报告要求、停止条件、三态审核和当前版本批准判定已经进入本地工作区。
- A4 已完成：`EvidenceRecord`、六类 `SourceLocator`、六分区 `EvidenceCard` 和不可变 `EvidenceSnapshot` 已经进入本地工作区。
- A4 合并后，成员 B 可以正式产出共享 `EvidenceRecord` 与 `EvidenceCard`。
- A5 是下一阶段；完成并合并后，成员 C 可以正式产出跨论文 Claim 和报告输入。
- 当前 A1 至 A4 改动尚未提交或推送。
