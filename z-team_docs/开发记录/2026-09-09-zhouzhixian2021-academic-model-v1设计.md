# 开发记录：Academic Model v1 设计

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-09；2026-09-10 补充字段规范与最终验证 |
| 负责人 | A，`ZhouZhixian2021` |
| 协作人员 | Codex；B、C 的已提交需求作为输入 |
| 个人分支 | `dev/zhouzhixian2021` |
| 任务分支 | 无 |
| 提交 | 尚未提交 |
| 远程状态 | 本地未推送 |

## 目标

在不修改源码的前提下，将检索、证据、分析、报告和评测需求整理为 `academic-model v1` 共享数据草案，并集中列出需要负责人 A 决定的方案。

## 实际完成

- 新增[Academic Model v1 共享数据设计草案](../模块分工/academic-model-v1-design.md)。
- 整理可以直接确定的跨模块规则、候选公共对象、最小关系和第一版建议字段。
- 建立 A-01 至 A-12 决策清单，每项提供候选方案和推荐项，不在源码中写入未确认默认值。
- 确认 A-01 使用 `AcademicWorkId`，A-02 使用内部随机 ID 加独立去重映射。
- 确认 A-03 分别记录引用版本和证据实际使用版本，并定义正式发表、无法访问、仅有预印本及撤回场景的选择规则。
- 确认 A-04 对核心研究字段使用 `Availability<T>`，对展示性字段使用可选属性，并区分未知、不适用、未提取和失败。
- 确认 A-05 的 `EvidenceRecord` 同时保存可定位原文片段和带来源的结构化陈述，并限制低证据等级能够支持的陈述范围。
- 确认 A-06 由 B 生产单篇论文 `EvidenceCard`，C 负责跨论文分析。
- 确认 A-07 由 A 创建 `RetrievalRun`，B 填写来源结果和覆盖统计。
- 确认 A-08 使用四级结论置信度并强制提供理由。
- 确认 A-10 以 B 到 C 的最小纵向切片限定 v1 范围。
- 确认 A-11 为每个持久公共对象独立记录单调递增的 schema 版本。
- 确认 A-09 在消费 Claim 时比较证据版本，不主动改写或删除旧 Claim。
- 确认 A-12 使用包含人工审批和主动取消的六状态精简阶段集合。
- A-01 至 A-12 的负责人决策基线已完成，后续进入固定样例和字段可用性验证。
- 新增[固定接口样例](../interface-samples/academic-model-v1/README.md)，覆盖 B 的检索与证据输出、C 的分析输出以及 Claim freshness 检查。
- 确认 `EvidenceCard v1` 使用研究问题、方法、数据集、指标、发现和局限六个固定分区，并同步固定 JSON 样例。
- 确认 `Availability<T>` 使用五种状态及固定字段要求，并将样例日期的精度移入 `value`。
- 新增[Academic Model v1 字段规范](../模块分工/academic-model-v1-field-reference.md)，逐项解释字段含义、生产者、消费者、版本规则、失败状态和持久化职责。
- 确认 `WorkVersionId` 使用不可变内容版本语义；摘要或正文变化创建新 ID，元数据修正可以保留 ID。
- 确认 `ExternalIdentifier` 保存类型、规范值、原始值和来源，并以类型与规范值组成去重键。
- 确认 `ResearchBrief`、`PublicationWindow`、`EvidenceRequirements`、`ReportRequirements`、`StopConditions` 和 `BriefApproval` 的字段及重新审核规则。
- 确认 `SourceLocator` 六种定位类型、`EvidenceCard` 六分区条目字段、`CoverageSummary` 统计、`ProviderFailure` 分类和 `BatchResult` 部分成功语义。
- 确认 `ClaimRecord`、`ClaimEvidenceLink`、`ClaimAssessment` 和 `EvidenceSnapshot` 的字段及陈旧版本处理。
- 确认 Session、Evidence Store 和原始文件存储的职责；模型实际使用的证据必须能从 Session 日志重建。
- 明确本轮只整理 `z-team_docs`，不创建 `packages/academic`，不修改产品行为。

## 实际检查

- `pnpm run verify-md-links` 通过，共检查 2,280 个 Markdown 文件。
- 自定义 Node 校验通过：三个固定 JSON 均可解析，且 Brief、版本、外部标识、定位、EvidenceCard、批量失败、Claim、证据Snapshot 与 freshness 规则一致。
- `pnpm run test:docs` 通过仓库 `doc-quick` 文档检查。
- `git diff --check` 通过。
- `git status --short` 与 `git diff --name-only` 确认全部改动仅位于 `z-team_docs/`。

## 风险与限制

- 本文是设计草案，不是已发布公共接口。
- 本轮没有源码修改授权，不能创建共享类型实现。
- 固定样例与字段规范记录已经批准的 v1 语义，但不代表已经发布 TypeScript 接口或完成运行时实现。

## 下一步

- A 根据字段规范整理第一个源码 PR 的对象范围、Session 事件、测试和文档要求。
- A 与项目负责人确认实施顺序；只有负责人明确授权修改源码后，才进入 `academic-model` 实现。
