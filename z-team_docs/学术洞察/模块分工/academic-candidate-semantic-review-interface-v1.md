# 候选语义审核第一步：固定接口与交接样例

本文件固定[候选语义审核优化分工](academic-candidate-semantic-review-optimization-team-plan.md)的最小输入和输出。共享类型是 `CandidateSemanticReviewRequestV1`、`CandidateSemanticReviewV1`、`CandidateReviewSelectionV1` 与 `CandidateSemanticReviewStateV1`。A 的本地正式运行已接入此交换；真实模型质量和耗时仍需固定候选复验。

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

## B 可直接实现的函数签名

A 确定纯解析器由 `packages/academic/retrieval/` 导出，不接收模型、Session、完整 Brief／Plan 或关键词。A 从新请求取出这四个参数，负责传输与记录；B 只解析并逐字核对结构、批准问题和标题／摘要引文：

```ts
parseCandidateSemanticReview(
  text: string,
  title: string,
  abstract: Availability<string>,
  approvedQuestions: readonly string[],
): CandidateSemanticReviewV1
```

送审选择器同样是 B 的纯函数，由 A 传入同版本已批准 Brief／Plan、词项初排结果、对应评估、跨轮已实际发起模型请求的规范论文 ID 集合及部署审核上限。返回共享的 `CandidateReviewSelectionV1`，其中每篇去重候选只有一个决定；`selected` 带零起始发起顺序及 `question_coverage`／`lexical_fill` 原因，其余决定为 `not_selected_budget`、`hard_excluded`、`fulltext_unresolvable` 或 `already_attempted`，顺序与原因字段为 `null`。`routedQuestions` 只来自已批准查询来源，不获得语义分：

```ts
selectCandidateReviews(
  brief: ExecutableResearchBrief,
  plan: HybridSearchPlan,
  ranking: AcademicCandidateRankingResult,
  assessments: readonly CandidateAssessment[],
  attemptedWorkIds: ReadonlySet<AcademicWorkId>,
  maximumModelReviews: number,
): CandidateReviewSelectionV1
```

选择器核对 Brief／Plan 版本、评估与排名中的论文身份、审核上限为非负安全整数（0 表示不送审）。`attemptedBefore` 是之前各轮实际发起过模型请求的不同规范论文数，失败也计入；硬排除、预算未选、发起前取消不计入。`remainingBudget = max(0, maximumModelReviews - attemptedBefore)`，本轮 `selected` 不得超过余额。一篇可覆盖多个尚未送审的路由问题；先按批准问题顺序分配覆盖名额，再按既有词项初排补齐，最终破同分使用规范论文 ID。B 不从模型完成顺序决定任何队列。

`candidateReviewMaximumWorks = 8` 是首版**部署默认审核上限**，不是 Plan 的候选上限或 P0 数量。正式接线已移除 `Math.min(maximumModelReviews, maximumCandidateWorks)` 的二次截断，预算在初轮和缺口轮之间共享；`candidateReviewConcurrency` 默认 1，可显式配置为 2；当前 Web 部署使用 1。实际模型派发占用额度，失败也计入；派发前取消和输入预算拒绝不计入。B 选择器按覆盖优先、词项初排补齐分配名额。选择事件保存当轮实际配置及余额。

## 旧记录与展示接口

旧 `academic/candidate-screening-request`／`academic/candidate-screening-result` Session 事件及旧 `CandidateScreeningDetails` 保持原义，不能把其历史 JSON 按新三字段格式反读或改写。正式接线使用以下版本事件；它们都绑定已批准 Brief ID／版本及初轮为 0、缺口轮使用 Q3 对应序号的 `roundIndex`，不得与旧事件混用。每篇请求、结果和已验证判断携带所属 `selectionSeq`，结果及已验证判断携带对应 `requestSeq`：

| 新事件 | 持久内容与时机 |
| --- | --- |
| `academic/candidate-review-selection-v1` | 模型调用前保存 `CandidateReviewSelectionV1` 的完整决定、实际配置上限、已尝试数与剩余额度。 |
| `academic/candidate-semantic-review-request-v1` | 模型派发前保存规范论文与版本 ID、模型配置、完整消息及准入决定；输入超限以 `skip_input_limit` 记录，不计派发。预算未选或尚未准备的论文不写请求。 |
| `academic/candidate-semantic-review-result-v1` | 每次结算保存对应请求序号、原始模型流、可用的用量、结束原因及 `validated`／`failed`／`cancelled`／`skipped` 状态和失败代码。准备失败时请求序号为 `null`。 |
| `academic/candidate-semantic-review-verified-v1` | 仅在纯解析与引文校验通过后保存规范论文 ID、对应请求序号和 `CandidateSemanticReviewV1`；失败和取消不写。 |

A 将**通过校验且持久保存的**新判断交给 B 的评估器，与代码计算的 `surfaceKeywordHits` 合成现有评估；模型 `signals` 仅含有引文的问题匹配，方法、证据类型和贡献保留 B 的确定性线索回退。`scope` 保留三态。复查新判断使用已验证事件，旧事件按旧字段读取，两者不互相改写；已有运行恢复仍使用工作流检查点。

Q6 保留 `assessment.screening`、`matchedQuestions` 和评分字段，并增加可选的 `assessment.semanticReview`。`validated` 带 `scope: potentially_relevant | off_topic`；`unknown` 表示模型有效返回但无法判断；`failed` 带 `code`，表示调用或校验失败；`not_selected` 带 `reason`，为 `not_selected_budget`、`hard_excluded`、`fulltext_unresolvable` 或 `cancelled_before_dispatch`。历史评估缺少此字段时表示未记录，不推断成功或失败。C 从该状态展示各类计数，不从评分反推调用是否成功。状态随既有 Q6 观察和恢复检查点保存，候选审核事件本身不提供检查点之前的完整研究恢复。任何状态都不是全文证据或最终纳入结论。
