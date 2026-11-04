# 领域勘察计划模板

领域级请求先审核一份元数据勘察计划。勘察只检索学术来源的题名和摘要，形成有原文摘录支持的候选方向图谱；不承诺穷尽领域，也不进行全文证据抽取或生成最终研究报告。用户审核图谱、遗漏和预算后，再另行批准深入研究计划。

可读计划使用简体中文，标题包含“领域勘察”，说明原始领域边界、时间及版本口径、检索轮次、候选论文与耗时上限、遗漏复查、预期产物和不完整时的披露。执行块仅保留一个，格式如下。查询表达式由系统根据用户的中文需求生成，不要求用户填写。

```academic-domain-survey-json
{
  "schemaVersion": 1,
  "topic": "<领域名称>",
  "scope": "<明确的时间、论文版本及领域边界>",
  "selection": {
    "startYear": 2022,
    "endYear": 2026,
    "dateBasis": "published",
    "includedVersionTypes": ["preprint", "accepted_manuscript", "version_of_record"]
  },
  "queries": [
    { "expression": "<第一轮广域学术查询>", "purpose": "discovery", "roundIndex": 1 },
    { "expression": "<第二轮独立遗漏复查查询>", "purpose": "omission_check", "roundIndex": 2 }
  ],
  "limits": {
    "maximumCandidates": 40,
    "maximumResultsPerQuery": 20,
    "maximumElapsedMinutes": 20
  }
}
```

年份是示例；根据请求和当前日期决定。日期口径可用 `published` 或 `first_public_release`。无法确认选定日期或论文版本的记录不会进入图谱；计划正文应说明这一点。实际计划可用 2 至 12 条去重查询，1 至 4 轮，每轮最多三条；首轮必须有方向发现，后续轮必须有遗漏复查。候选上限最多 40 篇，选择较高预算前在中文正文披露。不要把第一轮的几个查询当作领域的方向清单。勘察结果不完整时，后续计划必须如实呈现限制。
