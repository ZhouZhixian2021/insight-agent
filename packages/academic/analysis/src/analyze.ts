/** Conservative cross-paper summaries derived from accepted producer statements. */
import {
  createClaimId, createClaimEvidenceLinkId, createEvidenceSnapshotId, isExecutableResearchBrief,
  type ClaimRecord, type ClaimEvidenceLink, type EvidenceId, type EvidenceCardItem, type ResearchBrief,
} from '@deepseek-ai/dsh-academic-model'
import { prepareAnalysisInput } from './index.ts'
import type { AnalysisInput, PreparedAnalysisInput } from './types.ts'

/** Analysis-owned result; shared evidence and Claim records retain their model types. */
export interface AnalysisResult {
  readonly prepared: PreparedAnalysisInput
  readonly claims: readonly ClaimRecord[]
  readonly links: readonly ClaimEvidenceLink[]
  readonly limitations: readonly string[]
}

/**
 * Summarize recorded methods and findings across at least two independent works.
 * This extractive baseline does not rank metrics, infer causation, or establish field-wide consensus.
 * @param input Producer records; no retrieval or model transport occurs here.
 * @param brief Currently approved research brief.
 * @param createdAt Caller-provided UTC analysis time.
 * @returns Versioned comparison claims, original evidence links, and explicit limitations.
 * @throws Error if the brief is not approved for its current version.
 */
export function analyzeEvidence(input: AnalysisInput, brief: ResearchBrief, createdAt: string): AnalysisResult {
  if (!isExecutableResearchBrief(brief)) throw new Error('Research brief requires approval for its current version.')
  const prepared = prepareAnalysisInput(input)
  const limitations = ['Extractive baseline only: no performance ranking, field-wide consensus, trend or research-gap inference.',
    'Generated comparisons require semantic review before final publication.']
  const selected = prepared.works.flatMap((work) => {
    const canonical = work.versions.find(v => v.version.workVersionId === work.work.canonicalVersionId)
    const version = canonical ?? (work.versions.length === 1 ? work.versions[0] : undefined)
    if (!version) {
      limitations.push(`Multiple evidence versions require explicit selection: ${work.work.title}`)
      return []
    }
    if (!brief.evidenceRequirements.allowPreprints && version.version.versionType === 'preprint') {
      limitations.push(`Preprint excluded by the brief: ${work.work.title}`)
      return []
    }
    return [{ work: work.work, version }]
  })
  const claims: ClaimRecord[] = []
  const links: ClaimEvidenceLink[] = []
  for (const section of ['methods', 'findings'] as const) {
    const rows = selected.flatMap(({ work, version }) => {
      const records = new Map(version.evidenceRecords.map(record => [record.evidenceId, record]))
      const entries = version.cards.flatMap<EvidenceCardItem>(card => card[section]).filter(entry => entry.evidenceIds.every((id) => {
        const record = records.get(id)
        return record !== undefined && record.verbatimExcerpt.status === 'available'
          && (brief.evidenceRequirements.minimumEvidenceLevel !== 'fulltext' || record.level === 'fulltext')
      }))
      if (entries.length === 0) return []
      return [{ work, version, entries }]
    })
    if (rows.length < 2) {
      limitations.push(`Insufficient independent works for ${section}: ${rows.length}; at least two are required.`)
      continue
    }
    const evidenceIds = new Set<EvidenceId>(rows.flatMap(row => row.entries.flatMap(entry => entry.evidenceIds)))
    const records = [...new Map(rows.flatMap(row => row.version.evidenceRecords)
      .filter(record => evidenceIds.has(record.evidenceId)).map(record => [record.evidenceId, record])).values()]
    const claimId = createClaimId()
    const abstract = records.some(record => record.level === 'abstract')
    const text = rows.map(row => `${row.work.title}: ${row.entries.map(entry => entry.statement).join('；')}`).join('\n')
    claims.push({ schemaVersion: 1, claimId, text, category: 'comparison',
      scope: `${section}; only the ${rows.length} included works and the stated experimental conditions.`,
      uncertainty: 'Statements are attributed to their source works; their truth and experimental comparability require review.',
      confidence: abstract ? 'low' : 'medium',
      confidenceReasons: [`${rows.length} independent works have locatable ${section} statements.`,
        abstract ? 'Some statements are supported only by abstracts.' : 'All cited statements have full-text evidence.',
        'Confidence describes this extractive summary, not a calibrated probability or comparative performance.'],
      validity: 'current', evidenceSnapshot: { schemaVersion: 1, evidenceSnapshotId: createEvidenceSnapshotId(),
        researchBriefId: brief.researchBriefId, researchBriefVersion: brief.version, createdAt,
        evidenceItems: records.map(record => ({ evidenceId: record.evidenceId, academicWorkId: record.academicWorkId,
          workVersionId: record.workVersionId, contentHash: record.contentHash.status === 'available' ? record.contentHash.value : null })) },
    })
    for (const record of records) links.push({ schemaVersion: 1, claimEvidenceLinkId: createClaimEvidenceLinkId(),
      claimId, evidenceId: record.evidenceId, relation: 'supports',
      rationale: 'Supports the attributed source statement only; does not establish superiority or agreement between works.' })
  }
  return { prepared, claims, links, limitations }
}
