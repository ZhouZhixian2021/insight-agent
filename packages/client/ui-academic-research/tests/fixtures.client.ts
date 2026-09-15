/** Serialized output of the fixed synthetic pipeline; test-only branded IDs. */
import type { ResearchReport } from '@deepseek-ai/dsh-academic-report'

const fixture = {
  'title': '检索增强生成：分项评测与失败定位',
  'mode': 'draft',
  'synthetic': true,
  'markdown': '# 检索增强生成：分项评测与失败定位\n\n> 草稿：未经完整审核，不作为最终研究结论。\n> 合成基准样例：论文和结果均为虚构，仅用于验证软件流程。\n\n## 管理层摘要\n\n纳入 2 项研究，形成 2 条对比记录。质量状态：needs_review。\n\n## 范围与方法\n\n给定材料分别记录哪些评测信息？哪些比较因证据不足而不能成立？\n仅整理给定材料，不执行补充搜索；结论范围限于纳入的论文与实验条件。\n\n## 论文对比与证据\n\n### 1. comparison\n\n合成论文 A：分项评测: 分别记录检索覆盖率和回答正确率。 合成论文 B：总体得分的限制: 分析总体得分对失败类型的区分限制。\n\n适用范围：methods; only the 2 included works and the stated experimental conditions.\n置信度：low；评测：partially_supported\n依据：2 independent works have locatable methods statements.；Some statements are supported only by abstracts.；Confidence describes this extractive summary, not a calibrated probability or comparative performance.\n不确定性：Statements are attributed to their source works; their truth and experimental comparability require review.\n\n- supports：[1]；证据 evidence-rag-a；Supports the attributed source statement only; does not establish superiority or agreement between works.\n- supports：[2]；证据 evidence-rag-b；Supports the attributed source statement only; does not establish superiority or agreement between works.\n\n### 2. comparison\n\n合成论文 A：分项评测: 记录了检索和回答两个方面的指标。 合成论文 B：总体得分的限制: 摘要指出总体得分不能区分检索和回答失败。\n\n适用范围：findings; only the 2 included works and the stated experimental conditions.\n置信度：low；评测：partially_supported\n依据：2 independent works have locatable findings statements.；Some statements are supported only by abstracts.；Confidence describes this extractive summary, not a calibrated probability or comparative performance.\n不确定性：Statements are attributed to their source works; their truth and experimental comparability require review.\n\n- supports：[1]；证据 evidence-rag-a；Supports the attributed source statement only; does not establish superiority or agreement between works.\n- supports：[2]；证据 evidence-rag-b；Supports the attributed source statement only; does not establish superiority or agreement between works.\n\n## 局限与质量检查\n\n- Extractive baseline only: no performance ranking, field-wide consensus, trend or research-gap inference.\n- Generated comparisons require semantic review before final publication.\n- No accepted entries in this section; this does not establish absence in the literature.\n- No accepted entries in this section; this does not establish absence in the literature.\n- No accepted entries in this section; this does not establish absence in the literature.\n- Field is unknown; preserve its original availability.\n- No accepted entries in this section; this does not establish absence in the literature.\n- No accepted entries in this section; this does not establish absence in the literature.\n- Entry has abstract evidence only; full experimental detail is not verified.\n- No accepted entries in this section; this does not establish absence in the literature.\n- No accepted entries in this section; this does not establish absence in the literature.\n- Entry has abstract evidence only; full experimental detail is not verified.\n- Field is not\\_extracted; preserve its original availability.\n- No accepted entries in this section; this does not establish absence in the literature.\n- References pass; semantic support still requires a review of the same evidence.\n- References pass; semantic support still requires a review of the same evidence.\n\n## 参考文献\n\n1. 合成论文 A：分项评测 — Example；正式引用版本：version-rag-a\n2. 合成论文 B：总体得分的限制 — Example；正式引用版本：version-rag-b\n\n## 证据附录\n\n### evidence-rag-a\n\n实际证据版本：version-rag-a；证据等级：fulltext；获取时间：2026-09-14T00:00:00Z\n来源：<https://example.invalid/paper>；定位：locator-rag-a\n\n> 本合成研究分别记录检索覆盖率和回答正确率。\n\n### evidence-rag-b\n\n实际证据版本：version-rag-b；证据等级：abstract；获取时间：2026-09-14T00:00:00Z\n来源：<https://example.invalid/paper>；定位：locator-rag-b\n\n> 本合成摘要指出总体得分不能区分检索失败和回答失败；没有提供实验数值。\n',
  'evaluation': {
    'status': 'needs_review',
    'assessments': [
      {
        'schemaVersion': 1,
        'claimAssessmentId': '67627eb7-b740-4866-a53f-6c07ad090f1a',
        'claimId': '6c5cd976-5815-4872-b059-79027f3f95e4',
        'status': 'partially_supported',
        'reason': 'Structural checks passed; semantic support is not yet independently reviewed.',
        'method': 'evidence-integrity-only',
        'methodVersion': '1',
        'assessedEvidenceIds': [
          'evidence-rag-a',
          'evidence-rag-b',
        ],
        'assessedAt': '2026-09-14T00:02:00Z',
      },
      {
        'schemaVersion': 1,
        'claimAssessmentId': '47f8a5bf-145d-48f6-b4f0-c2f702d270c5',
        'claimId': 'b46f8c2d-a930-48d9-b0ef-d71af7661544',
        'status': 'partially_supported',
        'reason': 'Structural checks passed; semantic support is not yet independently reviewed.',
        'method': 'evidence-integrity-only',
        'methodVersion': '1',
        'assessedEvidenceIds': [
          'evidence-rag-a',
          'evidence-rag-b',
        ],
        'assessedAt': '2026-09-14T00:02:00Z',
      },
    ],
    'issues': [
      {
        'claimId': '6c5cd976-5815-4872-b059-79027f3f95e4',
        'code': 'semantic_review_required',
        'message': 'References pass; semantic support still requires a review of the same evidence.',
      },
      {
        'claimId': 'b46f8c2d-a930-48d9-b0ef-d71af7661544',
        'code': 'semantic_review_required',
        'message': 'References pass; semantic support still requires a review of the same evidence.',
      },
    ],
  },
  'claims': [
    {
      'schemaVersion': 1,
      'claimId': '6c5cd976-5815-4872-b059-79027f3f95e4',
      'text': '合成论文 A：分项评测: 分别记录检索覆盖率和回答正确率。\n合成论文 B：总体得分的限制: 分析总体得分对失败类型的区分限制。',
      'category': 'comparison',
      'scope': 'methods; only the 2 included works and the stated experimental conditions.',
      'uncertainty': 'Statements are attributed to their source works; their truth and experimental comparability require review.',
      'confidence': 'low',
      'confidenceReasons': [
        '2 independent works have locatable methods statements.',
        'Some statements are supported only by abstracts.',
        'Confidence describes this extractive summary, not a calibrated probability or comparative performance.',
      ],
      'validity': 'current',
      'evidenceSnapshot': {
        'schemaVersion': 1,
        'evidenceSnapshotId': '301160a8-e85d-4349-b4c6-9bb4fdc141b9',
        'researchBriefId': 'brief-rag-benchmark',
        'researchBriefVersion': 1,
        'createdAt': '2026-09-14T00:01:00Z',
        'evidenceItems': [
          {
            'evidenceId': 'evidence-rag-a',
            'academicWorkId': 'work-rag-a',
            'workVersionId': 'version-rag-a',
            'contentHash': 'sha256:synthetic-rag-a',
          },
          {
            'evidenceId': 'evidence-rag-b',
            'academicWorkId': 'work-rag-b',
            'workVersionId': 'version-rag-b',
            'contentHash': 'sha256:synthetic-rag-b',
          },
        ],
      },
    },
    {
      'schemaVersion': 1,
      'claimId': 'b46f8c2d-a930-48d9-b0ef-d71af7661544',
      'text': '合成论文 A：分项评测: 记录了检索和回答两个方面的指标。\n合成论文 B：总体得分的限制: 摘要指出总体得分不能区分检索和回答失败。',
      'category': 'comparison',
      'scope': 'findings; only the 2 included works and the stated experimental conditions.',
      'uncertainty': 'Statements are attributed to their source works; their truth and experimental comparability require review.',
      'confidence': 'low',
      'confidenceReasons': [
        '2 independent works have locatable findings statements.',
        'Some statements are supported only by abstracts.',
        'Confidence describes this extractive summary, not a calibrated probability or comparative performance.',
      ],
      'validity': 'current',
      'evidenceSnapshot': {
        'schemaVersion': 1,
        'evidenceSnapshotId': '768633e7-ac9e-4622-81b5-9ba395b0bcf3',
        'researchBriefId': 'brief-rag-benchmark',
        'researchBriefVersion': 1,
        'createdAt': '2026-09-14T00:01:00Z',
        'evidenceItems': [
          {
            'evidenceId': 'evidence-rag-a',
            'academicWorkId': 'work-rag-a',
            'workVersionId': 'version-rag-a',
            'contentHash': 'sha256:synthetic-rag-a',
          },
          {
            'evidenceId': 'evidence-rag-b',
            'academicWorkId': 'work-rag-b',
            'workVersionId': 'version-rag-b',
            'contentHash': 'sha256:synthetic-rag-b',
          },
        ],
      },
    },
  ],
  'evidence': [
    {
      'schemaVersion': 1,
      'evidenceId': 'evidence-rag-a',
      'academicWorkId': 'work-rag-a',
      'workVersionId': 'version-rag-a',
      'level': 'fulltext',
      'verbatimExcerpt': {
        'status': 'available',
        'value': '本合成研究分别记录检索覆盖率和回答正确率。',
      },
      'sourcedStatement': '分别记录检索与回答指标。',
      'sourceLocatorId': 'locator-rag-a',
      'sourceProvider': 'fixture',
      'sourceUrl': 'https://example.invalid/paper',
      'retrievedAt': '2026-09-14T00:00:00Z',
      'contentHash': {
        'status': 'available',
        'value': 'sha256:synthetic-rag-a',
      },
      'extractionMethod': {
        'method': 'fixture',
        'methodVersion': '1',
      },
      'qualityNotes': [],
    },
    {
      'schemaVersion': 1,
      'evidenceId': 'evidence-rag-b',
      'academicWorkId': 'work-rag-b',
      'workVersionId': 'version-rag-b',
      'level': 'abstract',
      'verbatimExcerpt': {
        'status': 'available',
        'value': '本合成摘要指出总体得分不能区分检索失败和回答失败；没有提供实验数值。',
      },
      'sourcedStatement': '总体得分不能区分两类失败。',
      'sourceLocatorId': 'locator-rag-b',
      'sourceProvider': 'fixture',
      'sourceUrl': 'https://example.invalid/paper',
      'retrievedAt': '2026-09-14T00:00:00Z',
      'contentHash': {
        'status': 'available',
        'value': 'sha256:synthetic-rag-b',
      },
      'extractionMethod': {
        'method': 'fixture',
        'methodVersion': '1',
      },
      'qualityNotes': [],
    },
  ],
  'limitations': [
    'Extractive baseline only: no performance ranking, field-wide consensus, trend or research-gap inference.',
    'Generated comparisons require semantic review before final publication.',
    'No accepted entries in this section; this does not establish absence in the literature.',
    'No accepted entries in this section; this does not establish absence in the literature.',
    'No accepted entries in this section; this does not establish absence in the literature.',
    'Field is unknown; preserve its original availability.',
    'No accepted entries in this section; this does not establish absence in the literature.',
    'No accepted entries in this section; this does not establish absence in the literature.',
    'Entry has abstract evidence only; full experimental detail is not verified.',
    'No accepted entries in this section; this does not establish absence in the literature.',
    'No accepted entries in this section; this does not establish absence in the literature.',
    'Entry has abstract evidence only; full experimental detail is not verified.',
    'Field is not_extracted; preserve its original availability.',
    'No accepted entries in this section; this does not establish absence in the literature.',
    'References pass; semantic support still requires a review of the same evidence.',
    'References pass; semantic support still requires a review of the same evidence.',
  ],
} as unknown as ResearchReport

/** Return an independent recorded pipeline output.
 * @returns Synthetic draft data for viewer behavior checks.
 */
export function benchmarkReport(): ResearchReport { return structuredClone(fixture) }
