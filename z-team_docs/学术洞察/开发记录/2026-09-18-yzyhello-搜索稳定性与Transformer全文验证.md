# B：搜索稳定性与 Transformer 全文验证

## 本轮结论

2026-09-18 的短时实测中，OpenAlex 与 arXiv 各 12 次常规查询均成功返回结果。Transformer 通过现有 arXiv Provider 的明确标题或标识符查询可被找到，并成功取得、解析 HTML 全文。该结果支持交给 A 联调，不代表固定课题、长期稳定性或正式报告验收通过。

本轮只运行现有代码并新增本记录；未修改运行逻辑、A/C 配置、根依赖、页面、三个目录 Provider 或 `.agents/notes/`。已有 BERT 官方 PDF 对照见[此前交接记录](2026-09-18-yzyhello-OpenAlex发现与超时隔离.md)，本轮未重复下载 BERT。

## 常规查询方法

- 环境：Windows，本机 Node v24.19.0；测试开始于 2026-09-18 07:54:00 UTC（北京时间 15:54:00）。
- 通过 `node --import tsx/esm --input-type=module` 加载当前源码，实际调用 `AcademicSourceRuntime.searchAll()`，不是手工伪造 Provider 结果。
- 每次只选择一个 Provider，`maxResults: 5`，单来源时限 25000 ms；OpenAlex 自身时限 20000 ms，使用 keyword 模式，没有 API key。
- OpenAlex 本轮不设置 `publicationYears`，以区分发现能力与日期资格核验；结果可以包含 2017—2020 年以外的论文。未修改产品配置。
- 每个 Provider 执行以下 4 条查询，各 3 轮，共 24 次；arXiv 每次查询前等待 3200 ms。串行、单机、短时测试，没有自动重试、隐藏失败或并发压力测试。
- 每条查询的 5 条是单次上限；本测试不是 A 的跨批次去重与累计候选上限验证。

| 编号 | 原始查询 |
|---|---|
| Q1 | `Transformer self-attention long-range dependencies recurrent neural networks` |
| Q2 | `BERT bidirectional Transformer pre-training contextual representations` |
| Q3 | `Attention Is All You Need` |
| Q4 | `BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding` |

## 常规查询结果

| Provider | 请求成功且非空 | 中位耗时 | 最小—最大耗时 | 超时/限流/失败 |
|---|---|---|---|---|
| OpenAlex | 12/12 | 2087.5 ms | 1614—3076 ms | 本组未出现 |
| arXiv | 12/12 | 2219.5 ms | 997—3848 ms | 本组未出现 |

全部常规查询的 `batch.status` 为 `success`，失败列表为空，每次均返回 5 条。成功只表示请求完成和返回结果，不代表结果满足研究主题、时间范围或全文要求。

| 轮次 | 查询 | OpenAlex 耗时/ms | arXiv 耗时/ms |
|---|---|---:|---:|
| 1 | Q1 | 3076 | 3209 |
| 1 | Q2 | 1974 | 997 |
| 1 | Q3 | 2716 | 1261 |
| 1 | Q4 | 2150 | 2370 |
| 2 | Q1 | 2249 | 1793 |
| 2 | Q2 | 1767 | 1586 |
| 2 | Q3 | 2437 | 3042 |
| 2 | Q4 | 2025 | 3356 |
| 3 | Q1 | 1614 | 1807 |
| 3 | Q2 | 1728 | 3848 |
| 3 | Q3 | 2300 | 2069 |
| 3 | Q4 | 1670 | 3802 |

| 查询 | OpenAlex 前五条的代表作命中 | arXiv 前五条的代表作命中 |
|---|---|---|
| Q1 | 0/3 | 0/3 |
| Q2 | 0/3 | BERT 3/3 |
| Q3 | Transformer 同标题/作者聚合记录 3/3，但日期/版本有问题 | 0/3 |
| Q4 | BERT 3/3 | BERT 3/3 |

OpenAlex 各轮四条查询分别有 2、4、3、5 个结果带全文候选；这些数字不是全文下载成功数。arXiv 每个结果均可生成全文候选，也不代表地址已经逐一下载验证。OpenAlex 的 12 次 `truncated` 均为 true；arXiv 均为 false，但后者存在下文列出的标记缺陷。

## Transformer 定向定位与全文

以下是单独的明确输入对照，不是生产代码自动改写 Q1，也不计入上面的 24 次常规查询。

| 输入 | 现有 arXiv Provider 结果 |
|---|---|
| `"Attention Is All You Need"`（包括引号） | 1157 ms，成功，原论文排第 2 |
| `1706.03762` | 936 ms，成功，原论文排第 1 |

当前 arXiv Provider 仍将标识符文本交给 `all:` 搜索，因此标识符输入本身不是严格的单记录获取接口。测试根据返回的 `externalIdentifiers` 再确认目标确实是 `1706.03762`，而不是仅凭相似标题选取。

使用现有 Provider 的 `1706.03762` 查询重新定位，随后经 `resolveFullText()`、`HttpFetchProvider` 和 `fetchAcademicFullText()` 完成真实全文获取与解析：

| 项目 | 实测值 |
|---|---|
| 标题 | Attention Is All You Need |
| 作者 | Ashish Vaswani、Noam Shazeer、Niki Parmar、Jakob Uszkoreit、Llion Jones、Aidan N. Gomez、Lukasz Kaiser、Illia Polosukhin |
| 首次公开日期 | 2017-06-12（arXiv Atom published） |
| 取得版本 | 1706.03762v7，预印本 |
| 该版本更新日期 | 2023-08-02（不能写成取得了 2017 年原始版本全文） |
| 最终全文地址 | `https://arxiv.org/html/1706.03762v7` |
| HTTP 与完整性 | 200，HTML，未截断；响应内容 187989 字符 |
| 下载耗时 | 4583 ms |
| 下载及准备合计 | 4587 ms |
| 解析结果 | 67 个段落，25566 个文本字符 |
| 研究内容定位 | `4 Why Self-Attention`，第 38 个解析段落，涉及 sequential operations |
| 内容哈希 | `sha256:c59198ad823a2da2df5ae984308465a172d3e988645c974cc975d2c9cd0f6660` |

本对照把单地址下载时限设为 120000 ms，但实际约 4.6 秒完成；未修改产品默认时限。首个 HTML 候选成功，因此未请求 PDF 候选。该结果证明正文获取与段落定位，不等于已执行模型语义证据抽取、生成 Evidence Card、中文报告或人工审核。

BERT 的本轮 arXiv 查询返回 `1810.04805v2`，首次公开日期 2018-10-11，版本更新日期 2019-05-24，作者为 Jacob Devlin、Ming-Wei Chang、Kenton Lee、Kristina Toutanova。仅凭 OpenAlex 的 2019 年正式发表记录不能替代这个首次公开日期。

## 额外失败与 B 侧剩余问题

1. **直接 ID 列表接口超时。** 单独请求 `https://export.arxiv.org/api/query?id_list=1706.03762,1810.04805` 在 25000 ms 后抛出 `TimeoutError`。这是额外上游接口对照，不包含在 24 次现有 Provider 搜索成功统计内，没有重试该接口。后续成功的全文测试重新通过现有 Provider 的普通搜索定位论文，不能把额外接口的失败隐藏为“全部请求成功”。
2. **arXiv 截断标记不准确，属于 B 待修。** 独立检查 `search_query=all:1706.03762&max_results=5`，HTTP 200、3578 ms，Atom 中 `totalResults=6`，实际返回 5 个 entry；当前 `source-arxiv/src/provider.ts` 固定返回 `truncated: false`，无法如实报告上游结果未取全。本轮只验证并记录，没有修改解析器或公共接口。
3. **OpenAlex Transformer 元数据不适合直接纳入。** 目标聚合记录 `W2626778328` 虽匹配标题和 8 位作者，但当前主记录日期仍为 2025-08-23，规范化为 `accepted_manuscript`，候选为非 arXiv 的较晚稿件地址。本测试没有下载该地址，也没有把它算作满足 2017—2020 年、允许 preprint/version_of_record 的论文。
4. **OpenAlex 不是权威首次公开日期来源。** 本轮 BERT 聚合记录返回 2019-01-01，与此前带年份过滤的对照日期不同；现有实现将 `firstPublicDate` 保持 unknown 是必要限制。权威元数据的自动补齐尚未接线。

## 交付边界

可以交付给 A 的证据是：常规来源接口在本轮短时串行样本中 24/24 成功；现有 arXiv Provider 能通过明确输入定位 Transformer 并取得可定位全文；BERT 的首次公开元数据与此前官方 PDF 对照均已有证据。

不能宣称：长期稳定、并发稳定、固定主题查询必然命中两篇、所有候选都有正文、两篇都已做语义证据抽取，或真实 Web/Session 已验收。A 的接线与查询编排可以联调；B 仍应修正 arXiv 截断标记，并继续明确权威日期与版本的补齐责任。Session ID、Retrieval Run ID、报告质量状态本轮均未生成。
