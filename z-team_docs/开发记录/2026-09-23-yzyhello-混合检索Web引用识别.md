# B-H1：混合检索 Web 引用识别

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-23 |
| 负责人 | 成员 B，`Yzyhello` |
| 分支 | `dev/yzyhello` |
| 任务 | [混合检索团队分工中的 B-H1](../模块分工/academic-hybrid-retrieval-team-plan.md#b-h1识别-web-论文引用) |

## 交付

- 在 [Academic Source](../../packages/academic/source/README.zh.md) 增加纯引用识别函数 `identifyAcademicReferences(candidate)`，输入为 A 已合并的 `AcademicWebDiscoveryCandidate`，输出为 `AcademicReferenceIdentificationResult`；处理一条 Web 搜索结果时不发网络请求。
- 识别 DOI、arXiv ID、ACL Anthology、PMLR 和 CVF 官方论文页或可准确还原论文页的 PDF 地址；每条引用保留原始发现 URL，来源专用记录带 Provider 命名空间。
- 校验官方主机名与论文路径，排除相似域名、目录页和不完整编号。一个候选有多个有效引用时去重；无有效引用时返回明确问题；有效引用与其他识别问题可以同时返回。
- 新增 [识别逻辑测试](../../packages/academic/source/tests/identify-reference.spec.ts)及[设计记录](../../.agents/notes/implemented/feature/2026-09-23-academic-web-reference-identification.zh.md)，同步维护 Academic Source 的中英文 README。

## 验证

- A 的八条固定识别夹具逐条比对输出，一致。
- `pnpm exec vitest run packages/academic/source/tests/identify-reference.spec.ts --coverage --coverage.include=packages/academic/source/src/identify-reference.ts`：29 项通过，所测源文件语句、分支、函数和行覆盖率均为 100%。
- `pnpm exec tsc -p packages/academic/source/tsconfig.json --noEmit` 与针对新增源文件和测试的 `oxlint` 通过。
- `pnpm run doc-sync`：33 项通过；`pnpm run build` 与 `pnpm run publint` 通过；构建后的公开导出经 Node 实际调用通过。
- `pnpm run verify-node-next-types` 在 Windows 上因系统拒绝创建临时目录符号链接而无法运行到 TypeScript 检查，报错为 `EPERM`，不代表类型检查通过。
- 对真实 DOI、arXiv、ACL、PMLR、CVF 论文 URL 做无网络识别试验：均返回引用，不代表论文已由官方来源核验。

## 后续交接

B-H1 只从 Web 结果提取待核验标识，不读取论文元数据或正文。B-H2 需按标识符查询相应学术 Provider 的单篇官方记录，核对身份并返回正式论文数据；A 的双通道工作流随后才能消费核验结果。识别成功的 Web 摘要不能直接进入 EvidenceCard 或报告结论。
