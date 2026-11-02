Check the proposed Academic plan before review. Reply PLAN_CHECK_DONE after the tool results.

# 研究计划编写模板（选定方向专题示例）

以下是给系统的编写要求，不要原样放进用户的计划：将用户的日常表达整理成范围明确、能够执行的研究计划。标题、各级标题、说明和正文统一使用简体中文；论文原名、必要缩写可以保留，并用中文解释。计划以具体的中文一级标题开始，例如“RAG 对大模型幻觉影响的研究计划”。将占位提示替换为具体内容或明确假设，不要求用户填写技术字段。

用户审核研究意图、范围、证据要求和交付结果。由系统整理检索别名及执行参数，不要求用户理解 JSON、版本枚举或输入英文检索词。示例中的年份和数量不是固定要求，应结合用户意图与执行能力确定，并在可读计划中说明。

用户未特别要求按论文**首次公开日期**界定时间范围时，使用所选论文版本的发表／发布日期（执行块 `publicationWindow.dateBasis: "published"`），并在中文计划中明说这一口径。OpenAlex 的版本发布日期可用于这个口径，却不能证明首次公开日期。只有用户明确要求首次公开时间时才选择 `first_public_release`；若现有学术来源无法核实该日期，先在计划中告知可能导致候选被排除，不得暗中以发表日期代替。已批准计划的时间口径不能在运行时自动改写。

日期政策必须明确：固定截止日期用 `publicationDatePolicy.endMode: "fixed"` 并填写 `publicationWindow.end`；“截至检索时点”用 `run_start` 和 `end: null`；明确不设上限用 `unbounded` 和 `end: null`。使用用户认可的 IANA 时区（中文计划通常为 `Asia/Shanghai`），在可见计划中说明。`run_start` 在研究开始时冻结本地日历日期，恢复和重试沿用原值。不要根据模型记忆填写“今天”。

逐篇日期条件由程序依据结构化窗口执行，不交给内容模型比较日期。`inclusionRuleKinds` 和 `exclusionRuleKinds` 必须与对应规则数组逐项一一对应，取值为 `content` 或 `publication_date`；日期条件与内容条件分成独立条目。新增计划使用执行块版本 8。旧计划的 `end: null` 不能自动解释为“截至今天”，应补充明确政策后重新审核。

提交到 `exit_plan_mode` 的计划由简洁的中文审核正文和完整的系统执行块组成。正文只写会影响研究结果、证据判断或交付的用户决策，目标为 300 至 600 个中文字符；不逐项解释执行字段。保留且仅保留一个 `academic-research-brief-json` 围栏块，字段名和类型保持不变，所有重要选择与正文一致。不要添加标识、版本或批准字段；宿主从审核记录生成这些信息。

保持可见计划简洁：保留原问题数量，每题至多增加一句覆盖范围说明，不展开证据矩阵、方面标识或预算字段。执行块的 `coverageRequirements` 必须逐题列出原问题已包含的必要方面，方面标识全局唯一；`direct` 要求直接证据，只有用户明确要求量化或可核查实验效果时才用 `quantitative`。不要擅自增加统一分数、独立复现实验、多篇来源等要求。`searchTerms` 为该方面的定位／补检术语，不是新的研究范围。停止前核查最多两次，自动补强最多一轮；首次仍使用最小抽取。

## 研究目标

用一两句话说明研究主题、用户希望弄清的问题以及报告面向谁。必要的专业缩写用中文解释。

## 核心问题

列出通常三至五个能由论文回答的自然语言问题。不要列英文检索词或候选初筛词项。

## 研究范围

说明时间范围及使用发表日期还是首次公开日期，接受哪些论文版本（预印本、录用稿、正式发表版本），重要的纳入或排除限制，用户资料、所需证据等级和约需分析的论文数量。用户明确指定来源时说明该选择；否则用“学术来源检索，公开网页辅助发现”概括，不列内部来源名称、逐篇字段或数量预算。

领域级请求须写明“原需求为领域级”，并将本轮交付明确命名为“专题”或“选定方向”，不能沿用全领域报告的承诺。先用少量预检索整理可能的方向，再把本轮深入、仅作概览和不作系统覆盖的已知方向逐项写在下面三个小节；后者是示例，不宣称穷尽领域。专题级请求也保留这三个小节，空类别写“无”。执行块 `scopeDecision` 的每个方向必须逐字出现在对应小节。三条初轮查询是执行预算，不代表领域只有三个方向。若用户坚持全领域系统覆盖，应先说明当前预算无法支持，并请其选择分阶段研究，不提交虚称全覆盖的计划。

### 本轮深入研究

<本轮深入的方向>

### 仅作概览

无

### 不作系统覆盖

<本轮不作系统覆盖的已知方向>

## 执行方式

用四至五个简短步骤概括检索与去重、按范围筛选、阅读与提取可定位证据、围绕问题比较、形成报告。系统在同一次计划中生成检索方向和执行参数，用户无需另填检索词。

## 交付结果

说明报告语言、主要内容、引用方式以及证据不足时的处理。有有效证据但覆盖不足时说明是带警告的有限草稿；完全没有有效证据时停止，不编造结论。

## 待确认事项

只列需要用户决定且会实质改变结果的选择。没有则写“没有必须补充的选择，可以开始”。其余合理假设由系统提出并在相应正文处说明。

## 系统执行信息

这一部分由系统根据上述计划生成，无需用户填写。重要的范围、预计论文数量、证据不足处理和交付要求必须与上面的中文计划一致；内部最低值、上限、来源列表、检索词和枚举不在正文逐项重复。

系统根据批准问题整理 `candidateScreening`：每个问题至少有一组可在论文标题、学术来源摘要或关键词中寻找的中英文同义词；方法和证据各至少有一组线索。线索用于候选优先级，不代表论文满足纳入规则或已有可引用证据。`searchPlan` 的每条查询关联其服务的问题，覆盖全部问题，聚焦一个方向，去重后最多三条且不超过检索轮次上限；每个深入方向的准确标签须出现在至少一条查询的 `purpose` 中。查询只用于发现候选，不能替代时间、版本与逐篇纳入判断。`scopeDecision` 记录原请求广度与可读计划相同的方向取舍；`domain` 必须列出至少一个不作系统覆盖的已知方向，计划标题和执行主题都需标明“专题”或“选定方向”。上述内部词项和查询关联保留在执行块，不增加用户未审核的研究方向。

`candidateScreening` 的每个内部数组表示同一个概念的备选表达，任一别名命中即可；中英文译名必须分别保存，例如 `["planning", "规划"]`，不得拼成 `"planning 规划"` 或 `"planning（规划）"`。保留 `"tool use"`、`"reinforcement learning"` 等完整英文短语，不按空格拆词。不同概念只有确需在同一标题或摘要中同时出现时才分成多个概念组；例如 `[["agent", "智能体"], ["planning", "规划"]]` 要求智能体与规划同时命中。方法和证据的不同组提供各自线索。不要把多种可选研究方向误写为问题必须同时满足的概念；不要把英文术语与中文注释拼成一个别名。这些词项由系统编写和校验，不要求用户理解或修改。

直接学术检索只允许 OpenAlex 与 arXiv；Web 发现引用可由 OpenAlex、arXiv、ACL Anthology、PMLR 与 CVF 核验。通用 Web 搜索只发现候选，Web 标题、摘要和生成式答案不属于学术证据。启用 `web_discovery` 时，每条查询的 Web 结果上限不得超过 8，引用核验上限不得超过 8；结合用户范围选择更小预算。没有启用 Web 发现时，两项上限填 0，核验 Provider 填空数组。没有启用直接学术检索时，直接检索 Provider 填空数组。

以下约束仅供系统填写执行块，不要复制进用户计划正文：`includedWorkTypes` 只允许 `preprint`、`accepted_manuscript`、`version_of_record`，分别对应预印本、录用稿、正式发表版本，不表示会议或期刊分类。`allowPreprints: false` 优先排除预印本。`minimumIncludedWorks` 不得超过 `targetIncludedWorks`，目标不得超过候选数量和最终纳入数量上限。不得承诺系统没有可靠字段支持的严格会议／期刊筛选，不得悄悄修改已经批准的范围。

`inclusionRules` 和 `exclusionRules` 只记录逐篇规则：每条规则必须能够根据一篇候选论文及其已核验来源独立判断，并应用于每一篇候选。需要多篇论文共同满足的组合目标，例如“至少纳入一篇指定基准论文”“整体覆盖多个领域、任务或方法路线”“兼顾实证论文与综述”，不得写入这两个数组；应将其拆成研究问题和对应检索方向，用论文数量表达总量要求，并在未达到时通过覆盖缺口和报告限制披露。例如，“论文直接研究 RAG 幻觉或回答忠实性”可以是逐篇纳入条件；“整体覆盖 RAGTruth、HaluEval 或 GaRAGe”属于文献组合覆盖目标。

报告不设置字数上下限；`targetLength` 为兼容字段，填写 `{ "unit": "characters", "minimum": null, "maximum": null }`。历史已批准计划中的非空上下限不再作为交付门槛，也不据此改写原批准记录。不要自行向用户承诺最低字数，也不要为了凑字数重复内容。

当前可执行报告使用 `language: "zh-CN"`、`citationStyle: "numeric"` 和 `targetLength.unit: "characters"`。支持的章节为 `executive_summary`、`scope_and_method`、`technology_overview`、`paper_landscape`、`cross_paper_analysis`、`key_findings`、`limitations`、`research_gaps`、`references`、`evidence_appendix`；`research_scope` 和 `directions` 分别是 `scope_and_method` 和 `technology_overview` 的别名。无法表达的要求应先用中文说明限制，再请用户选择，不要承诺不可执行的格式。

```academic-research-brief-json
{
  "schemaVersion": 8,
  "topic": "<中文研究主题：选定方向专题>",
  "aliases": ["<系统整理的检索别名>"],
  "questions": ["<中文研究问题>"],
  "scopeDecision": {
    "requestedBreadth": "domain",
    "deepDiveDirections": ["<本轮深入的方向>"],
    "overviewDirections": [],
    "notSystematicallyCovered": ["<本轮不作系统覆盖的已知方向>"]
  },
  "coverageRequirements": [{
    "question": "<中文研究问题>",
    "aspects": [{ "aspectId": "q1.a1", "label": "<原问题中的必要回答方面>",
      "evidenceRequirement": "direct", "searchTerms": ["<用于定位该方面证据的术语>"] }]
  }],
  "searchPlan": [
    {
      "query": "<系统根据研究问题整理的检索表达>",
      "purpose": "<本轮深入的方向>：<该检索方向的中文说明>",
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
  "candidateScreening": {
    "questions": [
      { "question": "<中文研究问题>", "concepts": [["<论文内容中的对应术语或同义表达>"]] }
    ],
    "methods": [["<方法线索及其同义表达>"]],
    "evidence": [["<实验或评估线索及其同义表达>"]],
    "contributions": []
  },
  "publicationWindow": {
    "start": { "iso": "2020", "precision": "year" },
    "end": null,
    "dateBasis": "published"
  },
  "publicationDatePolicy": {
    "endMode": "run_start",
    "timeZone": "Asia/Shanghai",
    "inclusionRuleKinds": ["content"],
    "exclusionRuleKinds": ["content"]
  },
  "includedWorkTypes": ["preprint", "accepted_manuscript", "version_of_record"],
  "inclusionRules": ["<每篇候选论文都必须满足、可由该论文独立判断的中文纳入条件>"],
  "exclusionRules": ["<可根据单篇候选论文独立判断的中文排除条件>"],
  "evidenceRequirements": {
    "minimumIncludedWorks": 3,
    "targetIncludedWorks": 6,
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
