# Agent Note: 学术摄取——以纯库实现去重与版本合并

Status: implemented

[English](2026-09-11-academic-ingestion-deduplication.md) | 中文

## 问题

提供方把每条捕获的记录规范化为全新的 `AcademicWork`/`WorkVersion` 对，因此同一研究工作若以预印本与正式出版版出现，或同时出现在 OpenAlex、Crossref 与 arXiv 中，就会变成若干互不相关的身份。下游的证据与分析必须为每篇论文指向同一成果，同时每个具体版本仍可寻址，否则版本去重会被每个消费方重复实现。

共享模型有意停在去重键原语（`externalIdentifierDedupKey`）处，不记录持久映射（[模型 README](../../../../packages/academic/model/README.zh.md)）。去重规则属于 B 的职责（[接口需求](../../../../z-team_docs/模块分工/academic-retrieval-evidence-interface-requirements.md)）：显式的外部标识符自动合并，仅靠标题/作者/年份的相似只能标记为疑似重复，且去重规则后续变化不得改变成果身份。

## 决策

`@deepseek-ai/dsh-academic-ingestion`（`packages/academic/ingestion`）是一个纯库。它拥有去重、版本合并与规范版本选择；索引是调用方传入传出的不可变值，因此持久映射与持久化留待后续增量。

1. **精确键**是记录携带的每个外部标识符的 `externalIdentifierDedupKey`（DOI、arXiv、OpenAlex、PubMed、提供方记录）。任何碰撞都意味着同一成果。
2. **模糊键**折叠规范化后的标题、第一作者与年份。模糊碰撞会作为 `suspected_duplicate` 上报，绝不自动合并，符合「无标识符则不自动合并」规则。
3. **稳定身份**：新成果获得全新的 `createAcademicWorkId()`；索引把其携带的每个精确键映射到该 id，因此后续共享任一标识符的记录会合并进同一 id。以改变的规则重跑也无法改写索引中已分配的 id。
4. **合并**把每个版本重新指向已分配的成果身份，合并外部标识符，并调和成果：规范版本所属的记录拥有标题、作者、发表状态与场所；`workVersionIds` 取并集；`firstPublicDate` 取最早可用日期。
5. **规范版本**在非撤回版本中优先 `version_of_record` > `corrected` > `accepted_manuscript` > `preprint`，同类型按更晚发布日期、再按摄取顺序决定；仅当无其他版本时撤回版本才作为候选。

该库消费 `IngestRecord`（一对 `{ academicWork, workVersion }`），其结构与来源 seam 的 `AcademicSourceWork` 相同，因此提供方输出无需依赖 `dsh-academic-source` 即可流入。

## 包拓扑

```text
@deepseek-ai/dsh-academic-model  <--depends on--  @deepseek-ai/dsh-academic-ingestion
      shared records + key                        library (createIngestIndex / ingestWorks)
```

摄取只依赖共享模型。它不定义 Cordis 服务，也不定义提供方；工作流增量可在稍后把索引包装进服务。

## 索引与审计

`IngestIndex` 持有 `byExactKey`（外部标识符键 → `AcademicWorkId`）、`byFuzzyKey`（模糊键 → `AcademicWorkId`）与 `records`（`AcademicWorkId` → 按摄取顺序排列的贡献记录）。`ingestWorks(index, records)` 返回更新后的索引、去重后的 `works` 与重新指向身份的 `versions`，以及 `IngestAudit`，其条目为 `new_work`、`merged_version` 或 `suspected_duplicate`。

## 曾考虑的替代方案

### 把摄取做成持有索引的 Cordis 服务

针对本增量否决。工作流尚没有消费方，服务会把状态锁在 Cordis 接线之后，却不增加正确性。纯状态变换器完全可测，可在工作流驱动时再包装进服务；待重访点是「一旦消费方需要共享状态，就把索引包装进服务」。

### 复用第一条记录的提供方生成 id 作为稳定身份

否决。提供方生成的 id 是逐条记录的载体；摄取拥有成果身份，因此索引而非第一条记录的结构才是映射的唯一来源。

### 自动合并模糊的标题/作者/年份匹配

否决。接口需求把模糊相似保留给人工确认；自动合并会静默折叠标题、作者与年份相同的不同成果。

## 后果

**提供方 id 是载体。** 每条规范化记录的 `academicWorkId` 被丢弃并替换为索引分配的身份；只有索引的分配才是权威。

**模糊匹配是建议性的。** 一批中仅共享模糊键的版本保持分离，直到精确标识符把它们关联，或人工确认疑似重复。

**身份按索引追加。** 分配 id 从不改写更早的 id；后续改变模糊规范化可以重新标记疑似重复，但无法拆分或重排已合并的成果。

**无持久化。** 索引驻留内存；持久化、持久映射记录与合并审计字段需单独确认设计。

## 延后工作

- 索引与审计的持久化。
- 对仅共享模糊键的记录做批内聚类。
- 精度感知的 `firstPublicDate` 比较（解析混合年/日精度，而非比较 ISO 文本）。
- 拥有长期索引并把去重成果送入证据生产的工作流/服务包装器。
