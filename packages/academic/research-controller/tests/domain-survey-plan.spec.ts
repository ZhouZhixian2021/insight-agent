import { describe, expect, it } from 'vitest'
import { parseDomainSurveyPlan } from '../src/domain-survey-plan.ts'

const survey = { schemaVersion: 1, topic: '近五年操作系统研究', scope: '2022 年以来的公开学术论文',
  selection: { startYear: 2022, endYear: 2026, dateBasis: 'published',
    includedVersionTypes: ['preprint', 'accepted_manuscript', 'version_of_record'] },
  queries: [
    { expression: 'operating systems research', purpose: 'discovery', roundIndex: 1 },
    { expression: 'OS systems conference survey', purpose: 'discovery', roundIndex: 1 },
    { expression: 'computer systems emerging topics', purpose: 'omission_check', roundIndex: 2 },
  ], limits: { maximumCandidates: 40, maximumResultsPerQuery: 25, maximumElapsedMinutes: 20 } }

const markdown = (value: unknown) => '# 操作系统领域勘察计划\n\n检索 2022 至 2026 年按发表日期认定的预印本、录用稿、正式发表版本。候选最多 40 篇，耗时最多 20 分钟。先检索并整理方向，不预先选定三个专题。\n\n'
  + '```academic-domain-survey-json\n' + JSON.stringify(value) + '\n```'

describe('domain survey plan', () => {
  it('accepts a reviewed bounded discovery and independent omission pass', () => {
    const parsed = parseDomainSurveyPlan(markdown(survey))
    expect(parsed.queries).toHaveLength(3)
    expect(parsed.limits.maximumQueriesPerRound).toBe(3)
  })

  it('rejects an omission check in the discovery round', () => {
    const queries = survey.queries.map(query => ({ ...query, roundIndex: 1 }))
    expect(() => parseDomainSurveyPlan(markdown({ ...survey, queries }))).toThrow('后续轮次')
  })

  it('rejects an unbounded or unreviewed survey', () => {
    expect(() => parseDomainSurveyPlan(markdown({ ...survey, limits: { ...survey.limits,
      maximumCandidates: 1000 } }))).toThrow('maximumCandidates')
    expect(() => parseDomainSurveyPlan(markdown({ ...survey, unexpected: true }))).toThrow('未经审核')
  })

  it('rejects an invalid date window and unsupported work version', () => {
    expect(() => parseDomainSurveyPlan(markdown({ ...survey,
      selection: { ...survey.selection, endYear: 2021 } }))).toThrow('endYear')
    expect(() => parseDomainSurveyPlan(markdown({ ...survey,
      selection: { ...survey.selection, includedVersionTypes: ['unknown'] } }))).toThrow('includedVersionTypes')
  })
})
