# 候选语义审核第一步：固定接口与交接样例

本文件固定[候选语义审核优化分工](academic-candidate-semantic-review-optimization-team-plan.md)第一阶段的输入和输出。共享 TypeScript 类型是 `CandidateSemanticReviewRequestV1` 与 `CandidateSemanticReviewV1`；当前正式运行仍使用旧提示词和 `CandidateScreeningDetails`，A 的接线完成前不得将样例当作已生效结果。

## 模型调用输入

Controller 从同版本已批准 Brief／Plan 与 Q3 规范论文构造请求。`research.topic` 与 `research.questions` 分别来自 Brief 主题和研究问题；问题按批准顺序去重且只出现一次。`inclusionRules`／`exclusionRules` 只取涉及研究主题和论文研究目的的自然语言规则；日期、版本、撤稿和全文地址等已经由代码硬筛的规则不重复送模型。遇到无法确定归属的批准规则，保留该规则而不静默删去。`paper.title` 和 `paper.abstract` 只来自学术 Provider。摘要缺失保留 `Availability` 的原因，不填 Web 摘要。模型不接收完整 Plan、检索词、关键词、方法／证据／贡献概念、词项命中或评分。

```json
{
  "schemaVersion": 1,
  "research": {
    "topic": "检索增强生成与幻觉",
    "questions": ["检索增强生成如何影响回答的事实忠实性？"],
    "inclusionRules": ["研究检索增强生成的事实忠实性"],
    "exclusionRules": ["排除与语言模型回答无关的图像生成研究"]
  },
  "paper": {
    "title": "Retrieval-Augmented Generation for Faithful Question Answering",
    "abstract": {
      "status": "available",
      "value": "We study whether retrieved passages improve factual faithfulness in question answering."
    }
  }
}
```

## 模型返回与校验

模型仅返回 `schemaVersion`、`scope` 和 `matchedQuestions`，不得返回词项命中、方法、证据类型、贡献、评分或论文结论。`scope` 复用 `CandidateScopeDecision` 三态：`potentially_relevant` 至少有一个实际匹配的问题；`off_topic` 和 `unknown` 的问题列表为空。每个问题最多出现一次，必须是批准 Brief 中的原文；引文须是该篇规范标题或学术摘要的连续原文片段，摘要不可用时只允许标题引文。明确偏题必须给出可核对引文和简短原因；仅因词项不匹配、摘要缺失或查询路由不符，不得判为偏题。

相关论文的固定返回：

```json
{
  "schemaVersion": 1,
  "scope": { "status": "potentially_relevant", "reason": "直接研究检索对问答事实忠实性的影响" },
  "matchedQuestions": [
    {
      "question": "检索增强生成如何影响回答的事实忠实性？",
      "quote": { "source": "abstract", "text": "retrieved passages improve factual faithfulness in question answering" }
    }
  ]
}
```

固定偏题论文标题为 `Diffusion Models for Image Generation`，学术摘要为 `We evaluate image synthesis from text prompts and do not study language-model question answering.`；它必须返回 `off_topic`、标题／摘要原文片段及空问题列表。固定未知论文标题为 `Adaptive Retrieval for Language Models`，摘要状态为 `{ "status": "not_extracted", "reason": "provider did not return an abstract" }`；仅凭标题无法判断时返回 `unknown` 和空问题列表：

```json
{
  "schemaVersion": 1,
  "scope": {
    "status": "off_topic",
    "reason": "研究图像生成，不涉及语言模型问答的事实忠实性",
    "quote": { "source": "abstract", "text": "do not study language-model question answering" }
  },
  "matchedQuestions": []
}
```

```json
{
  "schemaVersion": 1,
  "scope": { "status": "unknown", "reason": "只有标题且不足以判断研究问题" },
  "matchedQuestions": []
}
```

模型调用失败、超时、截断或 JSON／引文校验失败不是 `unknown` 模型回答：A 单独记录尝试状态和失败代码，保留本地词项初筛，不产生已验证语义匹配或偏题结论。解析器拒绝额外字段、重复或未批准问题、不连续引文、矛盾的范围结论；B 负责实现纯解析与核验，A 负责模型传输及 Session 记录。

## 旧记录与展示接口

旧 `academic/candidate-screening-request`／`academic/candidate-screening-result` Session 事件及旧 `CandidateScreeningDetails` 保持原义，不能把其历史 JSON 按新三字段格式反读或改写。A 接线时为新请求／结果使用独立版本事件，并将**通过校验的**新判断与代码计算的 `surfaceKeywordHits` 合成 `CandidateScreeningDetails`：`signals` 仅含有引文的问题匹配，方法、证据类型和贡献信号不由模型生成；`scope` 保留三态。B 的评估器不得因新模型未输出其他信号就抹掉本地词项线索。

Q6 既有 `assessment.screening`、`matchedQuestions` 和评分字段暂不删改，旧投影仍可读取。A 在接线时另给每篇候选提供明确的 `validated`／`unknown`／`failed`／`not_selected` 审核状态及失败原因；`unknown` 是模型已返回但未判定，`failed` 是调用或校验失败，`not_selected` 是预算未送审。C 只从该状态展示各类计数，不从 `scope` 或评分反推调用是否成功。任何状态都不是全文证据或最终纳入结论。
