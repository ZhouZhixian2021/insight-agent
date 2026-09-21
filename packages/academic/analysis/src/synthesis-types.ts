/** Question-driven analysis values; shared paper and evidence identities remain model-owned. */
import type { ClaimCategory, ClaimEvidenceRelation, CoverageSummary, EvidenceId, ProviderFailure,
  ResearchBrief, ResearchBriefId, RetrievalRunId } from '@deepseek-ai/dsh-academic-model'
import type { AnalysisInput } from './types.ts'

/** Exact materials submitted for one approved Brief version. */
export interface AcademicSynthesisInput {
  readonly schemaVersion: 1
  readonly synthetic: boolean
  readonly brief: ResearchBrief
  readonly retrievalRunId: RetrievalRunId
  readonly analysisInput: AnalysisInput
  readonly coverageSummary: CoverageSummary
  readonly sourceFailures: readonly ProviderFailure[]
}

/** A cited attribution or a cross-paper conclusion, never a semantic review. */
export interface SynthesisStatement {
  readonly text: string
  readonly kind: 'source_statement' | 'synthesis'
  readonly category: ClaimCategory | null
  readonly scope: string
  readonly uncertainty: string | null
  readonly evidenceLinks: readonly {
    readonly evidenceId: EvidenceId
    readonly relation: ClaimEvidenceRelation
    readonly rationale: string
  }[]
}

/** Model-proposed question coverage; answered does not establish semantic support. */
export interface SynthesisQuestionAnswer {
  readonly questionIndex: number
  readonly status: 'answered' | 'partial' | 'unanswered'
  readonly statementIndexes: readonly number[]
  readonly reason: string | null
}

/** Canonical report sections in rendering order. */
export const SYNTHESIS_SECTIONS = ['executive_summary', 'scope_and_method', 'technology_overview',
  'paper_landscape', 'cross_paper_analysis', 'key_findings', 'limitations', 'research_gaps',
  'references', 'evidence_appendix'] as const

/** A supported section identifier after resolving explicit Plan aliases. */
export type SynthesisSectionId = typeof SYNTHESIS_SECTIONS[number]

/** Quarantined model paragraph; its zero-based index refers to the original response. */
export interface RejectedSynthesisStatement {
  readonly statementIndex: number
  readonly code: string
  readonly reason: string
}

/** Validated paragraphs with remapped references and host-owned rejection diagnostics. */
export interface AcademicSynthesisDraft {
  readonly schemaVersion: 1
  readonly researchBriefId: ResearchBriefId
  readonly researchBriefVersion: number
  readonly statements: readonly SynthesisStatement[]
  readonly questionAnswers: readonly SynthesisQuestionAnswer[]
  readonly sections: readonly {
    readonly sectionId: SynthesisSectionId
    readonly title: string
    readonly statementIndexes: readonly number[]
    readonly missingReason: string | null
  }[]
  readonly limitations: readonly string[]
  /** Never supplied by the model; empty when every candidate paragraph passes. */
  readonly rejectedStatements: readonly RejectedSynthesisStatement[]
}

/** Expected synthesis failure with a stable, source-text-free reason code. */
export class SynthesisError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'SynthesisError' }
}
