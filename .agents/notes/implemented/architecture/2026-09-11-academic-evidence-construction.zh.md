# Agent Note: 学术证据——带等级-定位校验的确定性构造

Status: implemented

[English](2026-09-11-academic-evidence-construction.md) | 中文

## 问题

共享模型以类型的形式定义了 `EvidenceRecord`、`EvidenceCard` 与六种 `SourceLocator` 变体，但没有任何东西铸造它们的身份；而且有一项约束无法用类型系统表达：记录的证据等级约束其定位类型（`metadata` 引用提供方记录、`abstract` 引用摘要中的字符区间、`fulltext` 引用页码、段落、表格或图）。直接构造这些记录的消费方可以把任意等级与任意定位配对，从而产生分析与引用无法信任的证据。

抽取——把检索到的摘要与全文变成陈述与片段——是面向模型的关注点，需随检索/工作流增量到来。本包现在应归属的是确定性构造与约束强制，独立于之后由谁填充内容。

## 决策

`@deepseek-ai/dsh-academic-evidence`（`packages/academic/evidence`）是一个纯库。它拥有构造与校验；抽取留待后续增量。

1. `createSourceLocator(input)` 构造六种定位变体之一，铸造 `sourceLocatorId`、固定 `schemaVersion: 1`、把 `contentHash`、`printedPage`、`sectionTitle`、`title` 与 `pdfPage` 缺省为 `null`，并拒绝负数字符区间、页码或段落号。
2. `createEvidenceRecord(input)` 铸造 `evidenceId`，强制等级-定位配对，并拒绝空的 `sourcedStatement`、`sourceProvider`、`sourceUrl` 与 `retrievedAt`。记录通过 `sourceLocatorId` 引用调用方构造的定位。
3. `createEvidenceCard(input)` 铸造 `evidenceCardId` 以及六个分区中每个条目的 `evidenceCardItemId`，拒绝空条目陈述；非空 `evidenceIds` 元组已由共享类型强制。

校验失败抛出 `EvidenceError`（重新实现 `HarnessError` 结构，无跨包基类），携带稳定代码：`EVIDENCE_LEVEL_LOCATOR_MISMATCH`、`EVIDENCE_EMPTY_FIELD`、`EVIDENCE_INVALID_LOCATOR`、`EVIDENCE_EMPTY_ITEM_STATEMENT`。

## 等级-定位配对

| 等级 | 定位类型 |
|---|---|
| `metadata` | `provider_record` |
| `abstract` | `abstract` |
| `fulltext` | `page_section` \| `paragraph` \| `table` \| `figure` |

这是模型封闭联合类型无法承载的唯一边界内不变量，因此在构造时于此强制，而非信任。

## 包拓扑

```text
@deepseek-ai/dsh-academic-model  <--depends on--  @deepseek-ai/dsh-academic-evidence
      shared records + ids                        library (createSourceLocator / createEvidenceRecord / createEvidenceCard)
```

证据只依赖共享模型。它不定义 Cordis 服务，也不定义提供方。

## 曾考虑的替代方案

### 把构造并入共享模型

否决。模型拥有词汇与纯辅助函数，不拥有特定领域的生产；`createEvidenceRecord` 的等级-定位规则是证据模块的策略，会把模型耦合到 B 的抽取决策。

### 仅用 TypeScript 校验

否决。等级-定位配对跨越两个独立类型的字段；仅编译期保证需要把每个等级重新编码为不同的记录类型，而共享模型有意避免这一点。

## 后果

**构造失败清晰。** 错误的配对或空字段在边界抛出，因此分析永远收不到等级与定位不一致的记录。

**内容由调用方拥有。** 本库既不检索也不抽取；调用方提供陈述、片段、哈希与来源，因此确定性层无需模型即可测试。

**片段-哈希存在性未强制。** 本库暂不要求 `abstract`/`fulltext` 有 `available` 片段、或 `fulltext` 有哈希；这些存在性规则与知道实际检索到何种材料的抽取增量一起实现。

## 延后工作

- 从检索到的摘要与全文中抽取陈述与片段。
- 按等级对 `verbatimExcerpt` 与 `contentHash` 的存在性规则。
- 填充并持久化记录与卡片、记录 `RetrievalRun`/覆盖的检索/工作流集成。
