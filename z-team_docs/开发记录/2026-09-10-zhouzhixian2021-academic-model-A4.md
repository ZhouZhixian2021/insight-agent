# Academic Model A4 开发记录

## 基本信息

- 日期：2026-09-10
- 负责人：成员 A（ZhouZhixian2021）
- 分支：`dev/zhouzhixian2021`
- 范围：实现成员 B 生产、成员 C 消费的可追溯证据与六分区 EvidenceCard 公共类型。

## 已完成

1. 新增 `EvidenceRecord`，同时保存可定位原文、带来源陈述、实际成果版本、证据等级、来源、获取时间、内容哈希、提取方法和质量提示。
2. 新增 `SourceLocator` 可辨识联合类型，覆盖 `provider_record`、`abstract`、`page_section`、`paragraph`、`table` 和 `figure` 六种定位。
3. 新增固定六分区 `EvidenceCard`：`researchQuestions`、`methods`、`datasets`、`metrics`、`findings` 和 `limitations`。
4. 为六类分区条目加入已确认的附加字段，并统一用 `Availability<T>` 表达核心字段缺失、未提取或失败。
5. 新增 `EvidenceSnapshot`，记录模型分析实际使用的 Brief 版本、证据 ID、成果 ID、成果版本和内容哈希。
6. 新增 Evidence Record、Evidence Card、Card Item、Source Locator 和 Evidence Snapshot 的随机 ID 创建函数。

## 核心字段含义

### EvidenceRecord

- `evidenceId`：一条可追溯证据的稳定内部 ID。
- `academicWorkId`：证据所属的跨版本学术成果。
- `workVersionId`：抽取证据时实际使用的不可变内容版本，不能用 `canonicalVersionId` 替代。
- `level`：`metadata`、`abstract` 或 `fulltext`；该字段表示材料深度，不评价论文质量。
- `verbatimExcerpt`：来源原文，使用 `Availability<string>`；无法取得原文时必须记录原因，不能伪造片段。
- `sourcedStatement`：成员 B 根据原文形成的结构化陈述，不能替代原文。
- `sourceLocatorId`：指向一条独立 `SourceLocator`。
- `contentHash`：证据所依据内容的哈希，内容不可稳定识别时使用 `Availability`。
- `extractionMethod`：记录抽取方法和方法版本。
- `qualityNotes`：保存限制证据使用范围的提示，不作为数值评分。

### SourceLocator

- `provider_record`：保存数据源、来源记录 ID 和 URL。
- `abstract`：保存摘要字符起止位置。
- `page_section`：保存章节标题、PDF 文件页码和可空印刷页码。
- `paragraph`：保存可空章节标题和段落序号。
- `table`：保存表格编号、可空标题、PDF 文件页码和印刷页码。
- `figure`：保存图片编号、可空标题、PDF 文件页码和印刷页码。
- 公共 `contentHash` 为 `string | null`；哈希变化后，旧定位和依赖证据需要重新验证。

PDF 文件页码使用数字。论文印刷页码使用 `string | null`，以保留罗马数字、附录页码等非纯数字标签。表格和图片可能没有独立可靠页码，因此两类页码允许为 `null`。

### EvidenceCard

- 每张卡片必须绑定一个 `AcademicWorkId` 和实际使用的 `WorkVersionId`。
- 六个分区始终存在；空数组表示没有取得该分区的证据支持条目。
- 每个条目的 `evidenceIds` 是非空数组，类型层保证至少关联一条直接支持它的 Evidence Record。
- `ResearchQuestionEntry.questionType`：descriptive、comparative、causal、exploratory 或 other。
- `MethodEntry.methodRole`：proposed、baseline、evaluation、analysis 或 other。
- `MetricEntry.value`：允许字符串或数字，保留来源表达；`evaluationContext` 负责保存比较条件。
- `FindingEntry.findingType`：primary、secondary、negative、null_result 或 other。
- `LimitationEntry.limitationType`：data、method、evaluation、generalizability、author_stated 或 other。

### EvidenceSnapshot

- Snapshot 绑定 `researchBriefId` 和 `researchBriefVersion`。
- 每个条目记录 `evidenceId`、`academicWorkId`、`workVersionId` 和可空 `contentHash`。
- Snapshot 创建后不可修改；重新分析需要创建新的 Snapshot。
- A4 只定义数据类型和随机 ID，不负责把 Snapshot 写入 Session；持久化与 Session 事件属于 A6。

## 成员协作边界

- 成员 B 可以在 A4 合并后生产 `EvidenceRecord`、`SourceLocator` 和 `EvidenceCard`。
- 成员 C 可以读取 Evidence Card 和 Evidence Snapshot，但跨论文 Claim 类型仍等待 A5。
- 成员 B 不在 Provider 包中重新声明同名公共类型；需要新增字段时把固定样例和使用场景交给成员 A。
- Academic Model 不抓取论文、不解析 PDF、不调用模型，也不判断某条学术结论是否可信。

## 文件范围

- `packages/academic/model/src/types.ts`
- `packages/academic/model/src/ids.ts`
- `packages/academic/model/src/index.ts`
- `packages/academic/model/tests/evidence.spec.ts`
- `packages/academic/model/README.md`
- `packages/academic/model/README.zh.md`
- `.agents/notes/implemented/architecture/2026-09-10-academic-model-package.md`
- `.agents/notes/implemented/architecture/2026-09-10-academic-model-package.zh.md`
- `docs/subsystems/academic-insight.md`
- `docs/subsystems/academic-insight.zh.md`

## 当前状态

- A1-A4 已提交到本地分支，提交号为 `b10d740`；首次推送被 pre-push 构建检查拦截，尚未上传到 GitHub。
- 推送检查发现 Academic Model 的 TypeScript 声明输出目录与仓库统一构建器不一致：新包写入 `lib/`，构建器要求从 `lib/types/` 读取。
- 已将 `tsconfig.json` 的声明输出目录改为 `lib/types/`，并同步修改 `package.json` 的 `types` 和 `exports.types` 入口。该修复不改变 Academic Model 的业务类型和运行时行为，只使新包遵循仓库现有发布结构。

## 验证结果

- Academic Model 聚焦测试：通过，4 个测试文件共 11 个测试。
- `pnpm exec tsc -b packages/academic/model --force`：通过。
- `pnpm exec tsx scripts/run-oxlint.ts packages/academic/model`：通过。
- 本次包 README、子系统说明和 Agent Note 的双语配对检查：通过。
- `pnpm exec vitest run scripts/doc-standard.spec.ts`：通过，12 个测试。
- `git diff --check`：通过。
- `pnpm run test:docs`：15 项门禁中 14 项通过，只有仓库既有的双语配对欠账失败；A4 更新的三组文档均未出现在失败清单中。
- 首次 `git push`：未上传；pre-push 在统一构建阶段发现 Academic Model 缺少预期的 `lib/types/index.js` 输入，因此安全终止。
- 修复后 `pnpm run build`：通过，Academic Model 运行时代码和类型声明均由仓库统一构建流程成功生成。
- 构建产物检查：`lib/index.js` 与 `lib/types/index.d.ts` 均存在，且 Node.js 可以成功导入 Academic Model 的公共 ID 创建函数。
- `pnpm run verify-package-paths`：通过，仓库内 `packages/*` 引用均可解析。
- `pnpm run verify-tsconfig-paths`：通过，TypeScript 工作区包别名为最新状态。
- `pnpm exec publint packages/academic/model`：通过，Academic Model 的发布文件、运行时入口和类型入口有效。

本阶段继续更新已有 Academic Model Agent Note，没有创建重复决策记录；同主题搜索未发现需要归档、删除或合并的其他活动 Agent Note。
