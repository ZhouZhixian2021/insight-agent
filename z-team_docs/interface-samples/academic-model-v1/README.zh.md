# Academic Model v1 固定接口样例

[English](README.md) | 中文

## 状态与用途

| 项目 | 内容 |
|---|---|
| 负责人 | A，`ZhouZhixian2021` |
| 状态 | 固定接口样例；洞察与进度样例已作为可执行测试夹具 |
| 数据性质 | 完全虚构，不代表真实论文、来源或检索结果 |
| 源码影响 | 数据与浏览器类型；Controller 测试使用进度夹具 |

本目录用固定 JSON 验证成员 B 的检索与证据输出能否直接支持成员 C 的跨论文分析。字段名以 [Academic Model v1 设计基线](../../模块分工/academic-model-v1-design.md)和[字段规范](../../模块分工/academic-model-v1-field-reference.md)为依据。进度样例实现 Academic Research Controller 导出的浏览器类型；既有领域样例在所属包导出类型前仍属于交接数据。

## 文件

- [`synthesis-input.sample.json`](synthesis-input.sample.json)、[`synthesis-output.sample.json`](synthesis-output.sample.json)、[`synthesis-partial-output.sample.json`](synthesis-partial-output.sample.json)及 [`synthesis-cases.sample.json`](synthesis-cases.sample.json)：洞察输入、完整与混合有效性的模型响应及可执行用例。部分响应保留三段有支持的内容，拒绝一段仅背景引用的缺口说明；解析与会话测试验证主机生成的诊断。全部段落均为合成材料，不是 Transformer 或 BERT 引文，不证明真实报告质量，详见[团队交接](../../模块分工/academic-synthesis-handoff.md)。

- [`b-retrieval-evidence.sample.json`](b-retrieval-evidence.sample.json)：模拟 B 输出的 Research Brief、检索运行、论文、版本、证据、Evidence Card、覆盖统计和逐项失败。
- [`c-analysis.sample.json`](c-analysis.sample.json)：模拟 C 直接引用 B 的稳定 ID 形成 Claim、Claim–Evidence 关联和评测结果。
- [`claim-freshness.sample.json`](claim-freshness.sample.json)：模拟证据版本变化后，旧 Claim 在使用时被判定为 `stale`。
- [`b-multi-source-search-batch.sample.json`](b-multi-source-search-batch.sample.json)：固定 B 一次多来源搜索的部分成功目标结果。
- [`c-academic-research-run.sample.json`](c-academic-research-run.sample.json)：固定 C 在正式接入前可使用的浏览器安全 Remote 目标结果，包括由生产方结算的来源检索、全文获取和证据抽取阶段状态。
- [`hybrid-retrieval-v1.sample.json`](hybrid-retrieval-v1.sample.json)：固定 A-H1 的已批准混合策略、全部五类引用、明确的未识别/格式错误/含糊识别问题、B 的核验成功/失败结果，以及 C 使用的浏览器安全混合阶段与计数投影。A-H4 为候选／引用行增加可选的查询归属；计数区分重复引用观察和实际 ingestion 论文合并。全部记录均为合成数据。
- [`academic-research-progress-v1.sample.json`](academic-research-progress-v1.sample.json)：固定 A-P1 的完整进度快照，覆盖检索开始、学术源直接搜索与 Web 发现活动、相互区分的摄取审计计数、全文与证据并行且三篇论文同时活动、超时重试和报告评测。论文活动同时携带论文与版本 ID。样例包含已观察数量与已运行时间，不包含估算百分比。

## 样例覆盖

1. 一个 `AcademicWorkId` 同时关联预印本和正式发表版本，避免重复计数。
2. `canonicalVersionId` 指向正式版，但全文不可访问时，Evidence Record 明确记录实际使用的预印本版本。
3. Evidence Record 分别覆盖 `fulltext`、`abstract` 和 `metadata`，并同时表达原文、结构化陈述或缺失原因。
4. 检索运行返回 `partial_success`，成功项与正文不可访问失败同时保留。
5. B 为单篇论文生成 Evidence Card，C 只消费 Card 和 Evidence Record 做跨论文分析。
6. C 的 Claim 通过稳定 ID 关联支持、反对或背景证据，并保存分析时使用的证据版本。
7. Claim 使用前比较证据版本；版本不一致时不得进入最终报告。
8. `EvidenceCard` 固定包含 `researchQuestions`、`methods`、`datasets`、`metrics`、`findings` 和 `limitations` 六个分区；没有受证据支持的条目时使用空数组。
9. `Availability<T>` 固定使用五种状态；包装层只保存 `status`、`value`、`reason` 或 `failureId`，字段自身的数据全部放入 `value`。
10. 一个 Provider 失败不会丢弃其他 Provider 的成功结果；工作流向 Web 客户端报告同一条失败和实际覆盖情况。
11. 来源检索、全文获取和证据抽取分别结算；后续阶段失败不会把成功的来源检索改标为失败。
12. Web 发现 URL、已识别引用、核验尝试与去重论文保持不同计数单位；DOI、arXiv、ACL、PMLR、CVF 引用保留发现来源与核验来源。
13. 引用识别会在同批问题旁保留成功引用；被丢弃的 Web 候选必须携带明确的未识别、格式错误或含糊问题，不能只返回无说明的空数组。
14. 进度快照保留全部六个阶段结论，表达同时运行的全文与证据工作，并使用单调递增序号让较新快照替换较旧快照。

## 已确认的字段规则

样例不使用 `null` 代替核心字段的缺失状态；空数组表示已经确认没有受证据支持的该类条目。字段规范已经确认以下规则：

- `SourceLocator` 使用 `kind` 区分六种定位类型，并绑定 `WorkVersionId` 和可用的内容哈希。
- `ProviderFailure.category`、`retryable` 和 `retryAfter` 共同控制失败分类和重试判断。
- 论文部分日期使用 `PartialDate`；运行、审核和评估时间使用完整 UTC ISO 8601 时间。
- Session 保存 Brief、运行和模型可见快照；证据对象进入 Evidence Store；大型原文进入独立文件存储。

## 验证标准

- 所有样例 JSON 文件必须能被标准 JSON 解析器读取。
- C 样例引用的每个 `academicWorkId`、`workVersionId` 和 `evidenceId` 必须存在于 B 样例。
- 同一个 `AcademicWorkId` 的多个版本只能计为一个研究工作。
- `metadata` 证据不得支持实验结果或方法细节。
- `partial_success` 必须同时包含成功 ID 和逐项失败。
- freshness 样例中的版本不一致必须得到 `stale`，且 `mayEnterFinalReport` 必须为 `false`。
- 进度夹具的序号必须递增，并发活动必须分别保留，进度帧不得包含估算百分比。

返回 [Academic Model v1 设计基线](../../模块分工/academic-model-v1-design.md)。
