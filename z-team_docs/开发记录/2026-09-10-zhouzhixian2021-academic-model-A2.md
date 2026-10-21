# Academic Model A2 开发记录

## 基本信息

- 日期：2026-09-10
- 负责人：成员 A（ZhouZhixian2021）
- 分支：`dev/zhouzhixian2021`
- 范围：实现学术成果、不可变版本、外部标识符和去重键。

## 已完成

1. 修正 A1 的 `Availability<T>`，与已确认的 available、unknown、not_applicable、not_extracted、failed 五态保持一致。
2. 新增 `FailureId`，使 failed 状态引用不透明失败 ID。
3. 新增 `PartialDate`，同时保存 ISO 日期文本和 year、month、day 精度。
4. 新增 `ExternalIdentifier` 与可扩展的标识符类型映射。
5. 新增 `AcademicWork`，保存跨版本身份、标题、作者、外部标识、已知版本、规范引用版本、首次公开日期、发表状态和场所。
6. 新增 `WorkVersion`，保存不可变版本类型、标签、发布日期、外部标识、提供方记录、内容哈希、前代版本和有效状态。
7. 新增随机 `AcademicWorkId`、`WorkVersionId` 创建函数。
8. 新增 `externalIdentifierDedupKey()`，严格使用 kind 与调用方提供的 normalizedValue，不执行隐藏规范化。

## 字段与规则说明

- `AcademicWork`：表示同一项学术成果，不随预印本、正式发表版或更正版变化。它集中保存标题、作者、外部标识符、已知版本和当前规范引用版本。
- `WorkVersion`：表示学术成果的一份不可变内容版本。版本被更正或撤回时保留原记录，并通过状态和前代版本关系表达变化。
- `PartialDate`：用 `iso` 保存已知日期文本，用 `precision` 明确来源只给出了年、年月还是完整日期，避免把未知的月或日伪造为确定值。
- `ExternalIdentifier`：同时保存标识符类型、规范化值、原始值和来源提供方。规范化值供匹配使用，原始值和来源用于追溯。
- `Availability<T>`：区分有值、来源未知、不适用、尚未抽取和处理失败；处理失败必须关联 `FailureId` 与原因。
- `canonicalVersionId`：指向当前适合引用和下游分析的版本，但不会删除或覆盖其他版本。
- `supersedesWorkVersionId`：在更正、替换等情况下指向直接前代版本；首个已知版本使用 `null`。
- `contentHash`：预留内容完整性与重复内容判断所需的哈希；未执行抽取时应使用 `not_extracted`，不能用空字符串代替。

## 暂缓实现：持久去重映射记录

本阶段已经确定去重键为 `kind + normalizedValue`，但尚未把键与 `AcademicWorkId` 的判断结果持久化。原因是持久记录会成为后续检索、合并与纠错共同依赖的数据，需要先确定审计粒度。

可选方案如下：

1. **简单映射**：只保存去重键到 `AcademicWorkId`。实现最简单，但无法解释为什么合并，也不利于纠错。
2. **带版本的决策记录（推荐）**：保存去重键、目标 `AcademicWorkId`、参与判断的外部标识符、判断依据、记录版本和时间信息。可以支持追溯与后续修正，复杂度适中；具体字段需负责人 A 确认后再实现。
3. **完整合并与拆分事件日志**：把建立、合并、撤销和拆分都保存为事件。审计能力最强，但首个 MVP 的实现和维护成本最高。

在方案确认前，成员 B 可以调用去重键函数并保存来源记录，但不应自行发布另一套公共持久映射类型。

## 文件范围

- `packages/academic/model/src/types.ts`
- `packages/academic/model/src/ids.ts`
- `packages/academic/model/src/external-identifiers.ts`
- `packages/academic/model/src/index.ts`
- `packages/academic/model/tests/availability.spec.ts`
- `packages/academic/model/tests/works.spec.ts`
- `packages/academic/model/README.md`
- `packages/academic/model/README.zh.md`
- `.agents/notes/implemented/architecture/2026-09-10-academic-model-package.md`
- `.agents/notes/implemented/architecture/2026-09-10-academic-model-package.zh.md`

## 当前状态

- A2 已进入本地工作区，尚未提交或推送。

## 验证结果

- `pnpm install`：完成工作区链接与锁文件更新。命令报告若干 Windows 可执行链接警告，但安装完成，Academic Model 依赖可解析。
- `pnpm exec vitest run packages/academic/model/tests/availability.spec.ts packages/academic/model/tests/works.spec.ts`：通过，2 个测试文件共 4 个测试。
- `pnpm exec tsc -b packages/academic/model --force`：通过。
- `pnpm exec tsx scripts/run-oxlint.ts packages/academic/model`：通过；检查发现的一处测试箭头函数格式已修正后复跑。
- `pnpm run verify-tsconfig-paths`：通过。
- 三组本次新增或更新文档的 `verify-translation-pairing` 聚焦检查：通过。
- `pnpm exec vitest run scripts/doc-standard.spec.ts`：通过，12 个测试。
- `git diff --check`：通过。
- `pnpm run test:docs`：15 项门禁中 14 项通过，只有仓库既有的双语配对欠账失败。本次 A2 的包 README、子系统说明和 Agent Note 均未出现在失败清单中。

仓库既有欠账包括 `z-team_docs/interface-samples/academic-model-v1/README.md` 缺少配对，以及旧学术洞察预设、学术洞察计划、学术洞察说明和事件生产者/消费者文档的配对元数据过期。这些文件不属于 A2 改动范围，本次未顺带修改。
