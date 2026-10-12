/** Deterministic metadata screening against explicitly reviewed terminology. */
import { metadataForVersion } from '@deepseek-ai/dsh-academic-ingestion'
import type { AcademicWorkId, CandidateClassification, CandidateFulltextAvailability, CandidateMetadataQuote,
  CandidateMetadataSignal, CandidateScreeningDetails, DetailedCandidateAssessment,
  ExecutableResearchBrief, HybridSearchPlan, WorkVersionId } from '@deepseek-ai/dsh-academic-model'
import type { PlannedSearchRoundResult } from './execute.ts'
import { validateScreeningQuotes } from './metadata-quotes.ts'

/** Concepts match independently; each concept contains interchangeable, reviewed phrases. */
export type CandidateTermConcepts = readonly (readonly string[])[]

/** Explicit screening inputs owned by the caller that reviews the research terminology. */
export interface CandidateScreeningCriteria {
  readonly topic: CandidateTermConcepts
  /** Exactly one entry per distinct approved question; matching requires all its concepts. */
  readonly questions: readonly { readonly question: string; readonly concepts: CandidateTermConcepts }[]
  readonly methods: CandidateTermConcepts
  readonly evidence: CandidateTermConcepts
  /** Lexical indications of contribution types, rather than confirmed full-text findings. */
  readonly contributions: readonly {
    readonly classification: Exclude<CandidateClassification, 'background' | 'irrelevant'>
    readonly concepts: CandidateTermConcepts
  }[]
  /** Omit both values when the reviewed publication window cannot support a recency score. */
  readonly asOfYear?: number
  readonly recencyWindowYears?: number
}

/**
 * Screen canonical scholarly metadata without using discovery snippets. Exact approved
 * query-to-question assignments may route a discovered candidate to a question, but do
 * not establish evidence support or scientific quality.
 * Missing methods/evidence score zero with an explicit reason. Natural-language scope rules remain
 * undecided until a caller supplies evidence; sourceQuality measures bibliographic completeness.
 * @param plan Approved constraints bound to the Brief version.
 * @param brief Approved Brief whose questions define the screening scope.
 * @param round Verified, deduplicated scholarly records from Q3.
 * @param criteria Reviewed phrases, including explicit multilingual aliases, and recency inputs.
 * @param fulltextFacts Controller resolution facts for every canonical version.
 * @param reviewedScreenings Optional externally reviewed semantic details; supplied details replace lexical indications for that work.
 * @returns One detailed metadata assessment per work; keywords alone never support scored indications.
 * @throws {RangeError} Approved inputs disagree, a quotation is not verbatim, or reviewed labels are not approved.
 */
export function assessPlannedCandidates(plan: HybridSearchPlan, brief: ExecutableResearchBrief,
  round: PlannedSearchRoundResult, criteria: CandidateScreeningCriteria,
  fulltextFacts: ReadonlyMap<WorkVersionId, CandidateFulltextAvailability>,
  reviewedScreenings?: ReadonlyMap<AcademicWorkId, CandidateScreeningDetails>): readonly DetailedCandidateAssessment[] {
  validateCriteria(plan, brief, criteria)
  if (reviewedScreenings !== undefined && [...reviewedScreenings.keys()]
    .some(id => !round.ingested.works.some(work => work.academicWorkId === id))) {
    throw new RangeError('reviewed screening must belong to a verified work in this round')
  }
  const versions = new Map(round.ingested.versions.map(version => [version.workVersionId, version]))
  const questionsByQuery = new Map(plan.queries.map(query => [query.searchQueryId, query.questions]))
  const discoveredBy = new Map(round.discoveredBy.map(item => [item.academicWorkId, item.searchQueryIds]))
  return round.ingested.works.map((work): DetailedCandidateAssessment => {
    const version = versions.get(work.canonicalVersionId)
    const fulltextAvailability = fulltextFacts.get(work.canonicalVersionId)
    if (version === undefined || version.academicWorkId !== work.academicWorkId || fulltextAvailability === undefined) {
      throw new RangeError('screening requires each work canonical version and explicit full-text resolution fact')
    }
    const metadata = metadataForVersion(round.ingested.index, version)
    const text = normalize([work.title,
      metadata.abstract.status === 'available' ? metadata.abstract.value : '',
    ].join('\n'))
    const sources: CandidateMetadataQuote[] = [{ source: 'title', text: work.title },
      ...metadata.abstract.status === 'available' ? [{ source: 'abstract' as const, text: metadata.abstract.value }] : []]
    const quoteFor = (concepts: CandidateTermConcepts): CandidateMetadataQuote => {
      const relevant = sources.filter(source => matchedConcepts(normalize(source.text), concepts).length === concepts.length)
      const only = relevant[0]
      if (only === undefined) throw new RangeError('scored metadata indication requires a title or abstract quote')
      return only
    }
    const topic = matchedConcepts(text, criteria.topic)
    const questions = criteria.questions.map(entry => ({ ...entry, matches: sources.reduce<string[]>((best, source) => {
      const matches = matchedConcepts(normalize(source.text), entry.concepts)
      return matches.length > best.length ? matches : best
    }, []) }))
    const provenanceQuestions = new Set((discoveredBy.get(work.academicWorkId) ?? [])
      .flatMap(searchQueryId => questionsByQuery.get(searchQueryId) ?? []))
    let matchedQuestions = questions
      .filter(entry => entry.matches.length === entry.concepts.length)
      .map(entry => entry.question)
    let methods = matchedConcepts(text, criteria.methods)
    let evidence = matchedConcepts(text, criteria.evidence)
    const contributions = criteria.contributions.filter(entry => sources.some(source =>
      matchedConcepts(normalize(source.text), entry.concepts).length === entry.concepts.length))
    let contributionSignals = [...new Set(contributions.map(entry => entry.classification))]
    const signals: CandidateMetadataSignal[] = [
      ...questions.filter(entry => matchedQuestions.includes(entry.question)).map(entry => ({
        kind: 'question' as const, question: entry.question, quote: quoteFor(entry.concepts),
      })),
      ...criteria.methods.filter(concept => matchedConcepts(text, [concept]).length > 0).map(concept => ({
        kind: 'method' as const, label: firstAlias(concept), quote: quoteFor([concept]),
      })),
      ...criteria.evidence.filter(concept => matchedConcepts(text, [concept]).length > 0).map(concept => ({
        kind: 'evidence_type' as const, label: firstAlias(concept), quote: quoteFor([concept]),
      })),
      ...contributions.map(entry => ({
        kind: 'contribution' as const, classification: entry.classification, quote: quoteFor(entry.concepts),
      })),
    ]
    const terms = [...new Set([brief.topic, ...brief.aliases, ...criteria.topic.flat(),
      ...criteria.questions.flatMap(entry => entry.concepts.flat()), ...criteria.methods.flat(),
      ...criteria.evidence.flat(), ...criteria.contributions.flatMap(entry => entry.concepts.flat())])]
    const surfaceSources = [...sources, ...metadata.keywords.status === 'available'
      ? metadata.keywords.value.map(value => ({ source: 'keywords' as const, text: value })) : []]
    const uncertainty = metadata.abstract.status === 'available'
      ? ['Lexical indications do not resolve negation or establish that a paper answers a research question.']
      : ['No scholarly abstract is available; title indications do not establish the paper scope.']
    const screening: CandidateScreeningDetails = reviewedScreenings?.get(work.academicWorkId) ?? {
      schemaVersion: 1, signals,
      surfaceKeywordHits: surfaceSources.flatMap(source => terms.filter(term =>
        matchedConcepts(normalize(source.text), [[term]]).length > 0).map(term => ({ term, ...source }))),
      uncertainties: uncertainty,
      scope: { status: 'unknown', reason: 'Lexical indications require a Plan-specific scope review.' },
    }
    validateScreeningQuotes(screening, work.title, metadata.abstract, brief.questions)
    if (reviewedScreenings?.has(work.academicWorkId)) {
      matchedQuestions = [...new Set(screening.signals.flatMap(signal => signal.kind === 'question' ? [signal.question] : []))]
      methods = reviewedLabels(screening, 'method', criteria.methods)
      evidence = reviewedLabels(screening, 'evidence_type', criteria.evidence)
      contributionSignals = [...new Set(screening.signals.flatMap(signal =>
        signal.kind === 'contribution' ? [signal.classification] : []))]
    }
    const date = plan.constraints.publicationWindow.dateBasis === 'first_public_release'
      ? work.firstPublicDate : version.releaseDate
    const publicationYear = date.status === 'available' ? Number(date.value.iso.slice(0, 4)) : undefined
    const completeFields = [work.authors.length > 0, work.venue.status === 'available',
      date.status === 'available', work.externalIdentifiers.length + version.externalIdentifiers.length > 0,
      metadata.abstract.status === 'available', metadata.keywords.status === 'available']
    return {
      academicWorkId: work.academicWorkId, ...metadata, fulltextAvailability, matchedQuestions, contributionSignals, screening,
      topicRelevance: Math.max(fraction(topic.length, criteria.topic.length),
        ...questions.map(entry => reviewedScreenings?.has(work.academicWorkId)
          ? matchedQuestions.includes(entry.question) ? 1 : 0 : fraction(entry.matches.length, entry.concepts.length))),
      methodMatch: fraction(methods.length, criteria.methods.length),
      evidencePotential: fraction(evidence.length, criteria.evidence.length),
      sourceQuality: completeFields.filter(Boolean).length / completeFields.length,
      recency: publicationYear === undefined || criteria.asOfYear === undefined
        || criteria.recencyWindowYears === undefined ? 0
        : Math.max(0, Math.min(1, 1 - (criteria.asOfYear - publicationYear) / criteria.recencyWindowYears)),
      inclusionRuleMatches: plan.constraints.inclusionRules.map(() => null),
      exclusionRuleMatches: plan.constraints.exclusionRules.map(() => null),
      diversityTags: methods,
      reasons: [
        reviewedScreenings?.has(work.academicWorkId)
          ? 'Reviewed metadata indications identify possible relevance; quotations do not confirm evidence or scientific quality.'
          : 'Metadata screening identifies lexical relevance and contribution cues; it does not confirm evidence or scientific quality.',
        `Topic concepts matched ${topic.length}/${criteria.topic.length}: ${topic.join(', ') || 'none'}.`,
        ...questions.map(entry => `Question "${entry.question}": ${entry.matches.length}/${entry.concepts.length} lexical concepts matched; ${reviewedScreenings?.has(work.academicWorkId) ? `reviewed metadata ${matchedQuestions.includes(entry.question) ? 'supports' : 'does not support'} the question; ` : ''}approved discovery-query provenance ${provenanceQuestions.has(entry.question) ? 'matched' : 'did not match'}.`),
        `Method cues ${methods.length}/${criteria.methods.length}: ${methods.join(', ') || 'none'}; evidence cues ${evidence.length}/${criteria.evidence.length}: ${evidence.join(', ') || 'none'}. Unassessed cues score zero.`,
        `Contribution cues: ${contributionSignals.join(', ') || 'none'}.`,
        `Scope ${screening.scope.status}: ${screening.scope.reason}`,
        ...screening.uncertainties,
        metadata.abstract.status === 'available' ? 'Scholarly abstract available.' : `Abstract unavailable: ${metadata.abstract.reason}`,
        metadata.keywords.status === 'available' ? 'Scholarly keywords available.' : `Keywords unavailable: ${metadata.keywords.reason}`,
        `Source quality is bibliographic completeness: ${completeFields.filter(Boolean).length}/${completeFields.length} fields available.`,
        criteria.asOfYear === undefined || criteria.recencyWindowYears === undefined
          ? 'Recency scoring is disabled because the reviewed publication window has no complete year range.'
          : publicationYear === undefined ? 'Publication date unavailable; recency scores zero.'
            : `Recency uses publication year ${publicationYear}, reference year ${criteria.asOfYear}, and window ${criteria.recencyWindowYears} years.`,
      ],
    }
  })
}

function reviewedLabels(screening: CandidateScreeningDetails, kind: 'method' | 'evidence_type',
  concepts: CandidateTermConcepts): string[] {
  const labels = screening.signals.flatMap(signal => signal.kind === kind && 'label' in signal ? [signal.label] : [])
  if (labels.some(label => !concepts.some(aliases => aliases.some(alias => normalize(alias) === normalize(label))))) {
    throw new RangeError('reviewed method and evidence labels must belong to approved screening concepts')
  }
  return concepts.filter(aliases => labels.some(label => aliases.some(alias => normalize(alias) === normalize(label))))
    .flatMap(aliases => aliases.slice(0, 1))
}

function validateCriteria(plan: HybridSearchPlan, brief: ExecutableResearchBrief, criteria: CandidateScreeningCriteria): void {
  if (plan.researchBriefId !== brief.researchBriefId || plan.researchBriefVersion !== brief.version
    || brief.approval.approvedBriefVersion !== brief.version) {
    throw new RangeError('screening requires the approved Brief version bound to the plan')
  }
  const questions = new Set(brief.questions)
  if (criteria.questions.length !== questions.size
    || new Set(criteria.questions.map(entry => entry.question)).size !== questions.size
    || criteria.questions.some(entry => !questions.has(entry.question))) {
    throw new RangeError('screening criteria must cover every distinct approved question exactly once')
  }
  const required = [criteria.topic, ...criteria.questions.map(entry => entry.concepts),
    ...criteria.contributions.map(entry => entry.concepts)]
  if (required.some(concepts => concepts.length === 0)
    || [...required, criteria.methods, criteria.evidence].some(concepts =>
      concepts.some(aliases => aliases.length === 0 || aliases.some(alias => normalize(alias) === '')))) {
    throw new RangeError('screening requires non-empty concepts and aliases for topics, questions, and contribution cues')
  }
  if ((criteria.asOfYear === undefined) !== (criteria.recencyWindowYears === undefined)
    || (criteria.asOfYear !== undefined && (!Number.isSafeInteger(criteria.asOfYear) || criteria.asOfYear < 1))
    || (criteria.recencyWindowYears !== undefined
      && (!Number.isFinite(criteria.recencyWindowYears) || criteria.recencyWindowYears <= 0))) {
    throw new RangeError('screening requires a positive reference year and recency window')
  }
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[-‐‑–—]/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function matchedConcepts(text: string, concepts: CandidateTermConcepts): string[] {
  return concepts.filter(aliases => aliases.some((alias) => {
    const phrase = normalize(alias)
    if (/\p{Script=Han}/u.test(phrase)) return text.includes(phrase)
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text)
  })).flatMap(aliases => aliases.slice(0, 1))
}

function fraction(matched: number, total: number): number {
  return total === 0 ? 0 : matched / total
}

function firstAlias(aliases: readonly string[]): string {
  const alias = aliases[0]
  if (alias === undefined) throw new RangeError('screening concept must include an approved alias')
  return alias
}
