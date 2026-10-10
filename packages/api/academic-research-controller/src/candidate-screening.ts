/** Build conservative metadata-screening inputs from one approved plan. */
import type { ExecutableResearchBrief, HybridSearchPlan } from '@deepseek-ai/dsh-academic-model'
import type { CandidateScreeningCriteria } from '@deepseek-ai/dsh-academic-retrieval'

/** Reviewed plan cues passed to the existing scholarly metadata assessor. */
export type AcademicCandidateScreening = Pick<CandidateScreeningCriteria,
  'questions' | 'methods' | 'evidence' | 'contributions'>

/**
 * Reuse only terms already approved in the Brief or its exact query plan.
 * Version-5 plans supply reviewed question, method, evidence, and contribution cues.
 * @param brief Approved Brief that owns the research topic and questions.
 * @param plan Exact reviewed plan whose query expressions are linked to those questions.
 * @param reviewed Optional metadata cues from the same approved plan.
 * @returns Deterministic criteria suitable for B's scholarly metadata assessor.
 */
export function approvedCandidateScreeningCriteria(
  brief: ExecutableResearchBrief,
  plan: HybridSearchPlan,
  reviewed?: AcademicCandidateScreening,
): CandidateScreeningCriteria {
  if (brief.researchBriefId !== plan.researchBriefId || brief.version !== plan.researchBriefVersion
    || brief.approval.approvedBriefVersion !== brief.version) {
    throw new RangeError('screening criteria require the approved Brief version bound to the plan')
  }
  const topicAliases = unique([brief.topic, ...brief.aliases])
  const topic = [topicAliases, ...plan.constraints.requiredTerms.map(term => [term])]
  const questions = reviewed?.questions ?? [...new Set(brief.questions)].map((question) => {
    const expressions = plan.queries.filter(query => query.questions.includes(question)).map(query => query.expression)
    return { question, concepts: [unique([question, ...expressions])] }
  })
  const range = completeYearRange(plan)
  return {
    topic,
    questions,
    methods: reviewed?.methods ?? [],
    evidence: reviewed?.evidence ?? [],
    contributions: reviewed?.contributions ?? [],
    ...(range === null ? {} : { asOfYear: range.end, recencyWindowYears: range.end - range.start + 1 }),
  }
}

function completeYearRange(plan: HybridSearchPlan): { readonly start: number; readonly end: number } | null {
  const { start, end } = plan.constraints.publicationWindow
  if (start === null || end === null) return null
  const startYear = year(start.iso), endYear = year(end.iso)
  if (startYear > endYear) throw new RangeError('screening publication window start must not follow its end')
  return { start: startYear, end: endYear }
}

function year(value: string): number {
  const result = /^(\d{4})(?:-|$)/u.exec(value)
  if (result?.[1] === undefined) throw new RangeError('screening publication dates must begin with a four-digit year')
  return Number(result[1])
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim().replace(/\s+/gu, ' ')).filter(Boolean))]
}
