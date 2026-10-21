# B：OpenAlex 发现与来源超时隔离

## 交付状态

本轮只改 B 的来源服务、新 OpenAlex Provider 及配套测试/文档。没有修改 A/C 的工作流、共享模型、Remote、页面、报告、Preset、Web 组装、根 tsconfig 或锁文件。工作区原有 CVF 和 Web 配置修改保持原样。

**固定验收未通过，不能把本轮改动称为已完成研究链路。** 来源机制与 BERT 单论文全文对照通过，但固定查询召回和首次公开日期仍有实测阻塞。

## 已实现

- `searchAll(request, signal)` 的单查询入参和返回类型不变；新增服务配置 `searchProviders`、`searchTimeoutMs`。
- 可仅调用 OpenAlex，保留 ACL/CVF/PMLR/arXiv 注册及已有全文解析功能。实际调用列表不会虚报未调用来源。
- 单来源超时中止其子信号并进入 `batch.failures`，其他来源保留；调用方取消仍中止整轮。未设置时限时保留调用方预算。
- OpenAlex 原查询单次请求，不规划、不分页、不重试；返回书目、外部标识、截断和覆盖限制。
- 从 ACL DOI、已知 ACL/CVF/PMLR 官方详情页和版本匹配的下载链接生成全文候选。**未实现任意 OpenAlex ID 到三个站点 ID 的映射，也没有自动官方站内补查。**
- OpenAlex 聚合发表日期不冒充 `first_public_release`；`firstPublicDate` 保留未知。该保守处理可能使严格日期筛选无法纳入论文，不能跳过披露。

## 真实联网结果

2026-09-18，本机 Node 24.19.0，关键词搜索、`publication_year:2017-2020`、每条上限 5；未使用自动重试。

| 查询 | 耗时 | 批次 | 返回数 | 截断 | 代表作命中 |
|---|---:|---|---:|---|---|
| `Transformer self-attention long-range dependencies recurrent neural networks` | 3199 ms | success | 5 | true | 未命中 Transformer 原论文 |
| `BERT bidirectional Transformer pre-training contextual representations` | 2232 ms | success | 5 | true | 未命中 BERT 原论文 |

两次实际来源均为 `openalex`，失败记录均为空。这里是两个来源批次各 5 条，不是 A 工作流跨批次去重后总共 5 条；没有代替 A 执行候选总量控制。

第一条返回 Neural Speech Synthesis with Transformer Network、Transformer-XL、Graph Neural Networks: A Review of Methods and Applications、Graph Contextualized Self-Attention Network for Session-based Recommendation、T-GSA。第二条返回 Sentence-BERT、ALBERT、Transformers: State-of-the-Art Natural Language Processing、BioBERT、LXMERT。

独立标题对照：BERT 命中 `W2963341956`，DOI `10.18653/v1/n19-1423`，4 位作者正确，正式发表日期为 2019-06-01。即使 OpenAlex 的 `pdf_url` 为空，也能解析为 `https://aclanthology.org/N19-1423.pdf`，交给现有 `HttpFetchProvider` 和 `fetchAcademicFullText()` 成功下载并准备可定位全文片段。此对照把全文时限设为 120000 ms，未修改产品默认 30000 ms。联网测试整体耗时 85.99 秒；不是两篇语义证据抽取或报告验收。

独立诊断：不加日期过滤时，标题 Attention Is All You Need 返回 `W2626778328`，但其 `publication_date` 为 **2025-08-23**、主 DOI 为 `10.65215/2q58a426`，同时包含 `http://arxiv.org/abs/1706.03762`。2017—2020 年过滤因此漏掉该记录。不得据此把原论文改记为 2025 年，也不能从混合版本记录推断首次公开时间。早先语义查询尝试返回 HTTP 504，没有把它作为可靠替代路线。

## 验证命令

来源、四个既有 Provider、OpenAlex、摄取和证据范围内的 13 个测试文件共 97 项通过；最后的来源/OpenAlex 定向回归 44 项通过。新包 TypeScript 编译、定向 Oxlint、3 组双语配对检查和 Agent Note 格式检查通过。联网 BERT 对照 1 项通过。没有运行或冒领完整仓库门禁、构建后的 Web 启动或真实 Session 验收。

```powershell
node node_modules/vitest/vitest.mjs run packages/academic/source/tests/source.spec.ts packages/academic/source-openalex/tests/provider.spec.ts packages/academic/source-openalex/tests/loader-composition.spec.ts
node node_modules/typescript/bin/tsc -b packages/academic/source-openalex/tsconfig.json
$env:ACADEMIC_OPENALEX_LIVE='1'
node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts packages/academic/source-openalex/tests/discovery.e2e.ts
```

直接调用现有本地工具是因为 `pnpm exec` 检测到新 workspace 后尝试重装依赖，并以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 退出；没有强制清空或重装工作区依赖。

## 交给 A 的接线事项

1. 审核新增插件，统一添加根路径映射、项目引用、Web 插件解析清单/依赖及锁文件；B 不并发修改这些集成文件。
2. 按包 README 的 YAML 配置选择 `searchProviders: [openalex]`、`searchTimeoutMs: 25000`。其他源可继续挂载，但它们的目录不会被查询。若需同时搜索 arXiv，应显式加入名单并在集成时验证固定查询召回。
3. 针对 `first_public_release`，不要直接使用 OpenAlex 年份过滤替代权威日期核验。必须先明确由哪个权威元数据路径补齐日期；仅取消过滤也不能保证代表作召回。
4. 如需代表作保证，应由拥有查询规划的层明确处理指定标题/ID；不能在 B 的 Provider 中硬编码这两篇或偷偷改写固定查询。用户仍固定原始查询且禁止来源规划时，本轮不能承诺研究内容通过。
5. 评估全文请求 120 秒预算与现有取消行为；不放松安全下载、响应字节上限或重定向规则。

当前目录配置包含 2017—2020 年相关目录的工作区改动来自此前工作，本轮未新增或冒领。选用仅 OpenAlex 发现后，目录配置存在不等于实际搜索这些目录；来源覆盖必须按实际调用返回。

## 最终验收记录边界

Session ID、Retrieval Run ID、跨批次去重统计、两篇处理结果和报告质量：本轮未运行 A/C 集成会话，均未生成。接线通过/未通过：**未验证**。研究内容通过/未通过：**未通过（固定查询未命中两篇、首次公开日期待权威补齐，未生成双篇证据与中文报告）**。
