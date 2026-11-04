# 已勘察领域的深入研究计划

只有当前 Session 已保存领域勘察结果、用户审阅了方向和限制，才提出此计划。仍须通过 `exit_plan_mode` 单独批准。可读计划按“本轮深入研究”“仅作概览”“不作系统覆盖”列出图谱中每一个方向，逐项说明深入方向的全文证据论文目标和最多查询数；将未分类论文和勘察限制作为范围风险说明。图谱之外可能有未知方向，不可宣称穷尽领域。

以 [研究计划模板](research-brief.md) 的版本 8 执行块为基础填写所有必需字段，并作以下版本 9 改动；不要同时提交版本 8 和版本 9 块：

- `schemaVersion` 改为 `9`。
- 增加 `domainResearchPlan`，其 `surveyPlanId` 必须是当前 Session 已保存勘察的准确标识。`directions` 必须逐一覆盖图谱中全部方向，方向标识与名称保持原样。每项含 `directionId`、`label`、`depth`、`question`、`targetSupportingWorks`、`maximumQueries` 六个字段。
- `depth` 为 `deep_dive`、`overview`、`excluded` 之一。深入方向的 `question` 是 `questions` 数组中的独立问题，`targetSupportingWorks` 为 1 至 5，`maximumQueries` 为 1 至 3；其他方向的后三项分别为 `null`、`0`、`0`。每个深入方向须有自己的一条问题。`scopeDecision` 三个方向数组按同样顺序和分类填写。
- 每条 `searchPlan` 增加 `directionId` 和 `roundIndex`。查询只能服务所属深入方向的问题；`purpose` 写出准确方向名称。按轮次排列，每轮最多三条，总数最多 12 条且不超过轮次预算。`stopConditions.maximumSearchRounds` 至少比计划查询使用的最大轮次多一轮，把最后一轮留给证据缺口补检。`candidateScreening`、`coverageRequirements` 与深入方向问题逐项对应。
- 计划正文说明全局候选、全文处理、纳入篇数和耗时上限。方向的 `targetSupportingWorks` 是报告核对目标，不是保证必然找到那么多论文；不足时报告必须显示缺口。元数据图谱不作为全文证据。

示意字段形状（不是另一份完整执行块）：

```json
{
  "domainResearchPlan": {
    "surveyPlanId": "<已保存勘察的完整标识>",
    "directions": [
      { "directionId": "<图谱标识>", "label": "<图谱名称>", "depth": "deep_dive",
        "question": "<该方向独立的中文研究问题>", "targetSupportingWorks": 2, "maximumQueries": 2 },
      { "directionId": "<另一图谱标识>", "label": "<另一图谱名称>", "depth": "overview",
        "question": null, "targetSupportingWorks": 0, "maximumQueries": 0 }
    ]
  },
  "searchPlan": [
    { "query": "<检索表达式>", "purpose": "<方向名称>：<检索目的>",
      "questions": ["<该方向的中文研究问题>"], "directionId": "<同上图谱标识>",
      "roundIndex": 1, "retrieval": { "channels": ["academic"],
        "academicProviders": ["openalex", "arxiv"], "verificationProviders": [],
        "maximumWebDiscoveryResults": 0, "maximumReferenceVerifications": 0 } }
  ]
}
```

这份结构化信息是用户批准的执行边界。正文、图谱方向、查询和预算不一致时，必须修正计划再送审。若方向数超过本轮能支持的深入查询与全文预算，按用户审阅的优先级将其列入“仅作概览”或“不作系统覆盖”，在报告中逐项披露，不能偷偷丢弃。
