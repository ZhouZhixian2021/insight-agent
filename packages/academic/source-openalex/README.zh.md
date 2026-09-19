---
description: "配置 OpenAlex 论文发现、检查特定版本的全文候选，并排查覆盖不完整或首次公开日期未知的问题。"
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-source-openalex

[English](README.md) | 中文

## 概述

通过 OpenAlex 搜索，无需每次查询都下载会议目录。每次调用只发送一次调用方原始查询，返回规范化书目信息和版本匹配的全文候选。论文发现不保证全文可下载，也不保证首次公开日期已验证。查询规划、日期资格和证据质量仍由工作流负责。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

组合必须让本插件可被解析，并挂载[来源服务](../source/README.zh.md)。包测试验证了 YAML 加载器组合；安装到 Web 配置由集成负责人完成，不由本包执行。

```yaml
- name: '@deepseek-ai/dsh-academic-source'
  config:
    searchProviders: [openalex]
    searchTimeoutMs: 25000
- name: '@deepseek-ai/dsh-academic-source-openalex'
  config:
    maxResults: 5
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `https://api.openalex.org` | 可信 HTTPS API 地址；不允许 URL 凭据、查询或片段 |
| `apiKeyEnv` | `OPENALEX_API_KEY` | 可选的 Bearer API 密钥环境变量 |
| `searchMode` | `keyword` | `keyword` 或显式选择的 `semantic`；不自动降级 |
| `publicationYears` | 未设置 | 可选 `YYYY-YYYY` 发表年份过滤，不是首次公开过滤 |
| `timeoutMs` | `20000` | 请求和响应正文的时限，单位毫秒 |
| `maxResults` | `50` | 单次请求上限；关键词搜索最多 100，语义搜索最多 50 |
| `maxCachedRecords` | `1000` | 全文位置缓存容量，至少为 `maxResults` |

已有 ACL、CVF、PMLR 和 arXiv 提供方可以继续挂载。`searchProviders` 之外的提供方不会被查询，也不会出现在实际调用列表中。OpenAlex 记录使用本提供方自己的 URL 解析器；OpenAlex ID 不是 ACL 或 PMLR ID。ACL DOI 和可识别的官方详情页可直接生成 PDF 候选，无需额外搜索。现有全文获取器仍负责下载安全和候选失败处理。

### 失败与日期过滤

经验证的 arXiv 链接提供成果级标识符，使现有摄取流程能合并已经检索到的 arXiv 记录及其首次公开日期。这不会自动获取缺失元数据，也不会把预印本标识符/URL 赋给正式发表版本。发表场所取自发表版本的位置记录，而不是仓储托管名称；会议排名和精确修订号仍未核验。`searchAll()` 在已有 `limitations` 字段中报告日期、场所、版本类型未知，以及全文解析候选缺失或解析失败的数量。

提供方区分取消、超时、限流、JSON/元数据格式错误、网络失败和其他 HTTP 错误。`searchAll()` 记录来源失败而不丢弃其他来源。OpenAlex 合并记录采用较晚发表日期时，日期过滤可能排除旧论文；发现阶段不能排除这类记录时应不设置过滤，再用权威元数据核验资格。所有 `firstPublicDate` 均保留未知，不把聚合日期当作已核验的首次公开日期。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

[规范化逻辑](src/normalize.ts) 验证上游响应，避免用预印本 URL 替代正式发表版本内容。[提供方](src/provider.ts) 在有容量上限的实例内映射中保留 URL 候选。不存在需要不变量配套检查的独立可观察关系。单元测试覆盖映射与取消；YAML 加载器测试覆盖组合和结果快照。显式启用 `ACADEMIC_OPENALEX_LIVE=1` 的端到端测试记录固定长查询，并检查单独标识的 BERT 标题/全文对照；不证明固定查询召回或研究报告通过。

</details>

<a id="model-experience"></a>
## 模型体验

### 工作流拥有的学术上下文

#### 模型所见

工作流可从规范化结果中渲染 `academicWork`、`workVersion` 和来源 `limitations`。本插件不添加模型工具或提示词，也不拥有该渲染。

#### Token 影响

不直接使用 token；工作流选择哪些发现记录进入模型上下文。

#### KV Cache 影响

无直接影响；消费工作流负责构建提示词。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **发现不完整**——索引覆盖和排序可能遗漏必需论文；提供方不执行规划、分页或重试。语义搜索可用性取决于上游。
- **时间信息未核验**——发表日期可能来自合并后的较晚记录。严格按 `first_public_release` 筛选需要其他权威来源。
- **全文不完整**——缺失的 URL 保持缺失；未实现通用 DOI 重定向追踪或自动官方站内搜索。下载和语义证据抽取仍可能失败。
- **临时 URL 缓存**——重启或淘汰后需要重新发现；URL 不持久化到公共成果模型。超过配置容量的并发负载需要工作流拥有的持久解析机制。

<a id="dev-note"></a>
### 开发备注

Web 配置、根包路径/引用、锁文件和会话/报告验收仍由集成负责人处理。本包不宣称固定两查询的 Transformer/BERT 验收已通过。
