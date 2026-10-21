# RAG 与大模型幻觉研究计划（合成交接样例）

研究目标：梳理检索增强生成（RAG）在什么条件下有助于减少大模型幻觉，以及目前仍有哪些局限。核心问题：现有论文如何衡量幻觉或回答忠实性？检索到的材料何时能改善回答，何时反而引入错误？不同方法的结果有什么共同点和分歧？研究范围：优先看 2020 年以来发表或公开的相关论文，按所用版本的发表日期判断时间范围，允许预印本，并以可获取的论文全文为主要依据；公开网页只帮助发现论文。计划重点分析约五篇论文，明显偏离上述问题的论文不纳入。执行方式：检索并筛选论文，阅读可获得的全文，提取能定位到原文的证据，再围绕三个问题比较和成文。交付结果：生成附来源、说明证据等级和局限的中文研究草稿；若论文或证据不足，明确指出未回答的问题并保留受限草稿，完全没有有效证据时停止。待确认事项：没有必须补充的选择，可以开始。

## 系统执行信息

以下执行块由审核页默认折叠，用户可按需查看；批准仍指向整份计划。

```academic-research-brief-json
{
  "schemaVersion": 5,
  "topic": "检索增强生成与大模型幻觉",
  "aliases": ["retrieval augmented generation", "RAG hallucination", "answer faithfulness"],
  "questions": [
    "现有论文如何衡量幻觉或回答忠实性？",
    "检索到的材料何时能改善回答，何时反而引入错误？",
    "不同方法的结果有什么共同点和分歧？"
  ],
  "searchPlan": [
    {
      "query": "retrieval augmented generation hallucination faithfulness evaluation",
      "purpose": "发现幻觉与忠实性评测论文",
      "questions": ["现有论文如何衡量幻觉或回答忠实性？", "不同方法的结果有什么共同点和分歧？"],
      "retrieval": {
        "channels": ["academic", "web_discovery"],
        "academicProviders": ["openalex", "arxiv"],
        "verificationProviders": ["openalex", "arxiv"],
        "maximumWebDiscoveryResults": 5,
        "maximumReferenceVerifications": 5
      }
    },
    {
      "query": "retrieval grounded generation factual errors evidence",
      "purpose": "发现检索改善与引入错误的条件",
      "questions": ["检索到的材料何时能改善回答，何时反而引入错误？", "不同方法的结果有什么共同点和分歧？"],
      "retrieval": {
        "channels": ["academic"],
        "academicProviders": ["openalex", "arxiv"],
        "verificationProviders": [],
        "maximumWebDiscoveryResults": 0,
        "maximumReferenceVerifications": 0
      }
    }
  ],
  "candidateScreening": {
    "questions": [
      { "question": "现有论文如何衡量幻觉或回答忠实性？", "concepts": [["hallucination", "factuality", "faithfulness"]] },
      { "question": "检索到的材料何时能改善回答，何时反而引入错误？", "concepts": [["retrieval grounding", "retrieval error", "evidence quality"]] },
      { "question": "不同方法的结果有什么共同点和分歧？", "concepts": [["comparison", "benchmark", "evaluation"]] }
    ],
    "methods": [["retrieval augmented generation", "RAG"]],
    "evidence": [["experiment", "evaluation", "ablation"]],
    "contributions": []
  },
  "publicationWindow": { "start": { "iso": "2020", "precision": "year" }, "end": null, "dateBasis": "published" },
  "includedWorkTypes": ["preprint", "accepted_manuscript", "version_of_record"],
  "inclusionRules": ["论文直接研究检索增强生成的幻觉、事实性或回答忠实性。"],
  "exclusionRules": ["排除仅有产品宣传而没有可核验学术论文的材料。"],
  "evidenceRequirements": {
    "minimumIncludedWorks": 2,
    "targetIncludedWorks": 5,
    "minimumFulltextWorks": 1,
    "minimumEvidenceLevel": "fulltext",
    "requireLocatableEvidence": true,
    "allowPreprints": true,
    "insufficientEvidencePolicy": "continue_with_warning"
  },
  "targetAudience": "希望了解 RAG 研究现状的中文读者",
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
    "maximumCandidateWorks": 20,
    "maximumIncludedWorks": 8,
    "maximumElapsedMinutes": null,
    "saturationRounds": 2,
    "stopWhenEvidenceRequirementsMet": true
  },
  "assumptions": ["公开网页只帮助发现候选，不能代替经核验的论文证据。"]
}
```
