# 研究计划编写模板

以下是给系统的编写要求，不要原样放进用户的计划：将用户的日常表达整理成范围明确、能够执行的研究计划。标题、各级标题、说明和正文统一使用简体中文；论文原名、必要缩写可以保留，并用中文解释。计划以具体的中文一级标题开始，例如“RAG 对大模型幻觉影响的研究计划”。将占位提示替换为具体内容或明确假设，不要求用户填写技术字段。

用户审核研究意图、范围、证据要求和交付结果。由系统整理检索别名及执行参数，不要求用户理解 JSON、版本枚举或输入英文检索词。示例中的年份和数量不是固定要求，应结合用户意图与执行能力确定，并在可读计划中说明。

提交到 `exit_plan_mode` 的完整计划同时包含可读正文和系统执行块。保留且仅保留一个 `academic-research-brief-json` 围栏块，字段名和类型保持不变，值与可读计划一致。不要添加标识、版本或批准字段；宿主从审核记录生成这些信息。

## 研究目标

- 研究主题与术语解释：
- 希望帮助用户回答的问题或作出的判断：
- 具体研究问题：
- 目标读者与分析深度：

## 研究范围与证据要求

- 论文时间范围与日期口径：
- 纳入版本（预印本、录用稿、正式发表版本）：
- 纳入条件：
- 排除条件：
- 用户提供的资料（没有则说明）：
- 所需来源与证据层级，以及最低论文数和全文数：
- 检索渠道及其用途（学术源直接检索、通用 Web 候选发现）：
- 直接检索的学术来源与 Web 引用核验来源：
- 每条检索方向的 Web 发现上限与引用核验上限：

## 分析方法与交付内容

- 如何归纳研究方向：
- 比较哪些方面：
- 如何引用证据、区分事实与推断：
- 报告章节、中文输出和篇幅要求：

## 执行步骤

先用中文说明每条检索方向分别服务于哪些研究问题，以及该方向会使用哪些检索渠道、直接搜索哪些学术来源、由哪些学术来源核验 Web 候选，并说明 Web 发现与引用核验的数量上限。系统在同一次计划生成中准备 `searchPlan` 和每条查询的 `retrieval`，不让用户另外输入检索词、Provider 名称、枚举或 JSON。所有研究问题必须至少有一条对应查询；一条查询可以服务于多个问题。每条表达聚焦一个方向，使用简洁的学术检索术语，不要把全部问题和别名拼成一条长查询。查询去重后最多三条，且不能超过计划检索轮次上限。查询用于发现候选，时间、版本与纳入条件仍由后续筛选执行，不能承诺关键词本身保证这些条件。

第一版直接学术检索只允许 OpenAlex 与 arXiv；Web 发现引用可由 OpenAlex、arXiv、ACL Anthology、PMLR 与 CVF 核验。通用 Web 搜索只发现候选，Web 标题、摘要和生成式答案不属于学术证据。启用 `web_discovery` 时，每条查询的 Web 结果上限不得超过 8，引用核验上限不得超过 8；结合用户范围选择更小预算。没有启用 Web 发现时，两项上限填 0，核验 Provider 填空数组。没有启用直接学术检索时，直接检索 Provider 填空数组。

1. 检查用户提供的资料并确认研究范围。
2. 由系统整理互补的检索表达，检索论文并去重。
3. 按已批准范围筛选论文，获取全文或摘要，抽取并核验证据。
4. 围绕研究问题比较不同论文，分析一致结论、分歧和证据缺口。
5. 生成可追溯的中文研究草稿，检查引用与未满足的要求。

## 完成条件与限制

- 检索轮次、候选论文数和纳入论文数的上限，以及其他停止条件：
- 必须达到的论文和全文覆盖要求：
- 证据不足时的处理：有有效证据时是否带警告继续；没有有效证据时停止，不编造结论：
- 质量检查与未达到要求时的披露：
- 时间、费用或来源访问限制（未设置则明确说明）：
- 系统提出的范围假设与需要用户确认的关键选择：

## 系统执行信息

这一部分由系统根据上述计划生成，无需用户填写。所有影响范围、数量、证据不足处理和交付要求的决定，都必须先在上面的中文计划中说明。

以下约束仅供系统填写执行块，不要复制进用户计划正文：`includedWorkTypes` 只允许 `preprint`、`accepted_manuscript`、`version_of_record`，分别对应预印本、录用稿、正式发表版本，不表示会议或期刊分类。`allowPreprints: false` 优先排除预印本。不得承诺系统没有可靠字段支持的严格会议／期刊筛选，不得悄悄修改已经批准的范围。

当前可执行报告使用 `language: "zh-CN"`、`citationStyle: "numeric"` 和 `targetLength.unit: "characters"`。支持的章节为 `executive_summary`、`scope_and_method`、`technology_overview`、`paper_landscape`、`cross_paper_analysis`、`key_findings`、`limitations`、`research_gaps`、`references`、`evidence_appendix`；`research_scope` 和 `directions` 分别是 `scope_and_method` 和 `technology_overview` 的别名。无法表达的要求应先用中文说明限制，再请用户选择，不要承诺不可执行的格式。

```academic-research-brief-json
{
  "schemaVersion": 3,
  "topic": "<中文研究主题>",
  "aliases": ["<系统整理的检索别名>"],
  "questions": ["<中文研究问题>"],
  "searchPlan": [
    {
      "query": "<系统根据研究问题整理的检索表达>",
      "purpose": "<该检索方向的中文说明>",
      "questions": ["<中文研究问题>"],
      "retrieval": {
        "channels": ["academic", "web_discovery"],
        "academicProviders": ["openalex", "arxiv"],
        "verificationProviders": ["openalex", "arxiv", "acl", "pmlr", "cvf"],
        "maximumWebDiscoveryResults": 8,
        "maximumReferenceVerifications": 5
      }
    }
  ],
  "publicationWindow": {
    "start": { "iso": "2020", "precision": "year" },
    "end": null,
    "dateBasis": "first_public_release"
  },
  "includedWorkTypes": ["preprint", "accepted_manuscript", "version_of_record"],
  "inclusionRules": ["<中文纳入条件>"],
  "exclusionRules": ["<中文排除条件>"],
  "evidenceRequirements": {
    "minimumIncludedWorks": 3,
    "minimumFulltextWorks": 2,
    "minimumEvidenceLevel": "fulltext",
    "requireLocatableEvidence": true,
    "allowPreprints": true,
    "insufficientEvidencePolicy": "continue_with_warning"
  },
  "targetAudience": "<目标读者>",
  "reportRequirements": {
    "language": "zh-CN",
    "targetLength": { "unit": "characters", "minimum": null, "maximum": null },
    "requiredSections": ["research_scope", "directions", "limitations", "references"],
    "citationStyle": "numeric",
    "includeEvidenceAppendix": true,
    "includeMethodology": true,
    "includeLimitations": true,
    "includeResearchGaps": true
  },
  "stopConditions": {
    "maximumSearchRounds": 3,
    "maximumCandidateWorks": 30,
    "maximumIncludedWorks": 10,
    "maximumElapsedMinutes": null,
    "saturationRounds": 2,
    "stopWhenEvidenceRequirementsMet": true
  },
  "assumptions": ["<已在可读计划中说明的假设>"]
}
```
