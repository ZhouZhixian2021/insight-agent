/** Adapt completed workflow observations to the report-owned retrieval appendix. */
import { targetIncludedWorks, type ResearchBrief, type RetrievalRun } from '@deepseek-ai/dsh-academic-model'
import type { RetrievalDisclosure } from '@deepseek-ai/dsh-academic-report'
import type { HybridRunObservation } from './hybrid-run.ts'
import type { HybridSearchStageStatus } from './hybrid-search.ts'

/**
 * Describe observed retrieval without treating Web URLs or reference attempts as papers.
 * @param run Settled retrieval counts and classified failures.
 * @param brief Approved research limits.
 * @param hybrid Completed hybrid queries, absent when no hybrid query settled.
 * @param candidateLimit Effective candidate bound after applying the request override.
 * @returns Chinese report disclosure containing no Web snippets, generated answers or candidate bibliography.
 */
export function researchRetrievalDisclosure(
  run: RetrievalRun, brief: ResearchBrief, hybrid: HybridRunObservation | undefined, candidateLimit: number,
): RetrievalDisclosure {
  const coverage = run.coverageSummary
  const observations: { label: string; value: string | number }[] = [
    { label: '实际直接检索来源', value: run.providers.join(', ') },
    { label: '发现记录', value: coverage.discoveredRecords },
    { label: '去重论文', value: coverage.deduplicatedWorks },
    { label: '实际纳入', value: coverage.includedWorks },
    { label: '可用全文', value: coverage.availableFulltextWorks },
    { label: '批准候选上限', value: brief.stopConditions.maximumCandidateWorks },
    { label: '本轮候选上限', value: candidateLimit },
    { label: '目标纳入论文', value: targetIncludedWorks(brief) },
    { label: '最终纳入上限', value: brief.stopConditions.maximumIncludedWorks },
  ]
  const status: Record<HybridSearchStageStatus, string> = {
    success: '成功', partial_success: '部分成功', failed: '失败', not_run: '未运行',
  }
  if (hybrid === undefined) observations.push({ label: '混合检索', value: '没有已完成的混合查询观察值' })
  else {
    const counts = { academicDiscoveredRecords: '学术源直接发现记录', webDiscoveredUrls: 'Web 发现 URL',
      identifiedReferences: '识别引用', attemptedVerifications: '核验尝试', verifiedReferences: '核验成功',
      failedVerifications: '核验失败', discardedWebCandidates: '丢弃 Web 候选' } as const
    for (const field of Object.keys(counts) as (keyof typeof counts)[]) {
      observations.push({ label: counts[field], value: hybrid.queries.reduce((sum, entry) => sum + entry.observation[field], 0) })
    }
    observations.push({ label: '精确归并重复记录', value: hybrid.mergedDuplicates })
    for (const { query, observation } of hybrid.queries) {
      const policy = observation.policy
      const providers = [...new Set(observation.verificationOutcomes.map(outcome => outcome.status === 'verified'
        ? outcome.value.verificationProvider : outcome.failure.verificationProvider))]
      observations.push(
        { label: `查询 ${query} 的批准渠道`, value: policy.channels.map(channel => channel === 'academic' ? '学术源' : 'Web 发现').join(', ') },
        { label: `查询 ${query} 的批准直接来源`, value: policy.academicProviders.join(', ') },
        { label: `查询 ${query} 的批准核验来源`, value: policy.verificationProviders.join(', ') },
        { label: `查询 ${query} 的实际核验来源`, value: providers.join(', ') || '未核验' },
        { label: `查询 ${query} 的 Web 发现上限`, value: policy.maximumWebDiscoveryResults },
        { label: `查询 ${query} 的引用核验上限`, value: policy.maximumReferenceVerifications },
      )
      const stages = { academicSearch: '学术源搜索', webDiscovery: 'Web 发现',
        referenceIdentification: '引用识别', referenceVerification: '引用核验' } as const
      for (const stage of Object.keys(stages) as (keyof typeof stages)[]) {
        observations.push({ label: `查询 ${query} 的${stages[stage]}`, value: status[observation.stages[stage]] })
      }
    }
  }
  return { title: '检索渠道与覆盖说明', observations,
    scopeNotice: 'Web 搜索仅用于发现论文线索；网页摘要与生成式答案不作为学术证据或参考文献。运行成功不代表完整覆盖。',
    limitations: [coverage.truncated ? '本轮存在截断或覆盖限制。' : '未报告截断，不代表检索覆盖完整。', ...coverage.limitations],
    failures: run.failures.map(failure => `${failure.provider} · ${failure.operation} · ${failure.category}：${failure.message}`),
  }
}
