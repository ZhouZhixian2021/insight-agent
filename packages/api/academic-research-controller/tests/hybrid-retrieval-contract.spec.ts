import { readFileSync } from 'node:fs'
import type {
  AcademicReferenceIdentificationResult,
  AcademicReferenceVerificationOutcome,
  AcademicWebDiscoveryCandidate,
} from '@deepseek-ai/dsh-academic-source'
import { describe, expect, it } from 'vitest'
import type {
  AcademicHybridRetrievalView,
  AcademicResearchPlanView,
} from '../src/types.ts'

interface HybridRetrievalSample {
  readonly sampleSchemaVersion: 1
  readonly synthetic: true
  readonly planView: AcademicResearchPlanView
  readonly identificationCases: readonly {
    readonly candidate: AcademicWebDiscoveryCandidate
    readonly result: AcademicReferenceIdentificationResult
  }[]
  readonly verificationOutcomes: readonly AcademicReferenceVerificationOutcome[]
  readonly hybridRetrieval: AcademicHybridRetrievalView
}

const sample = JSON.parse(readFileSync(new URL(
  '../../../../z-team_docs/interface-samples/academic-model-v1/hybrid-retrieval-v1.sample.json',
  import.meta.url,
), 'utf8')) as HybridRetrievalSample

describe('Academic hybrid retrieval contract fixture', () => {
  it('freezes the approved channels, direct providers, verification providers, and budgets', () => {
    const retrieval = sample.planView.searches[0]?.retrieval
    expect(retrieval).toEqual({
      channels: ['academic', 'web_discovery'],
      academicProviders: ['openalex', 'arxiv'],
      verificationProviders: ['openalex', 'arxiv', 'acl', 'pmlr', 'cvf'],
      maximumWebDiscoveryResults: 8,
      maximumReferenceVerifications: 5,
    })
  })

  it('covers DOI, arXiv, ACL, PMLR, and CVF reference identities', () => {
    expect(sample.identificationCases.flatMap(entry => entry.result.references).map(reference => (
      reference.kind === 'provider_record' ? reference.provider : reference.kind
    ))).toEqual(['doi', 'arxiv', 'acl', 'pmlr', 'cvf'])
    expect(sample.identificationCases.every(entry => (
      entry.result.references.every(reference => reference.discoveryUrl === entry.candidate.url)
    ))).toBe(true)
    expect(sample.identificationCases[0]?.result.references[0]).toMatchObject({
      kind: 'doi',
      normalizedValue: '10.1000/synthetic.1',
      originalValue: '10.1000/synthetic.1',
    })
    expect(sample.identificationCases[0]?.result).toMatchObject({
      status: 'identified',
      issues: [{ code: 'invalid_reference' }],
    })
  })

  it('keeps explicit reasons when a Web candidate produces no reference', () => {
    const discarded = sample.identificationCases.filter(entry => entry.result.status === 'discarded')
    expect(discarded.map(entry => entry.result.issues[0]?.code)).toEqual([
      'unrecognized_page',
      'invalid_reference',
      'ambiguous_reference',
    ])
    expect(discarded.every(entry => (
      entry.result.references.length === 0 && entry.result.issues.length > 0
    ))).toBe(true)
  })

  it('keeps verified work data and per-reference failure data as separate outcomes', () => {
    expect(sample.verificationOutcomes).toHaveLength(2)
    expect(sample.verificationOutcomes[0]).toMatchObject({
      status: 'verified',
      value: {
        verificationProvider: 'acl',
        reference: { kind: 'provider_record', provider: 'acl' },
        work: { academicWork: { authors: ['Synthetic Author'] } },
        fullText: { sourceProvider: 'acl' },
      },
    })
    expect(sample.verificationOutcomes[1]).toMatchObject({
      status: 'failed',
      failure: {
        verificationProvider: 'pmlr',
        category: 'not_found',
        retryable: false,
      },
    })
  })

  it('keeps Web URLs, references, verification attempts, and works as distinct count units', () => {
    expect(sample.hybridRetrieval.counts).toEqual({
      academicDiscoveredRecords: 6,
      webDiscoveredUrls: 6,
      identifiedReferences: 5,
      attemptedVerifications: 5,
      verifiedReferences: 4,
      failedVerifications: 1,
      discardedWebCandidates: 1,
      mergedDuplicates: 2,
      deduplicatedWorks: 8,
    })
    expect(sample.hybridRetrieval.webCandidates).toHaveLength(6)
    expect(sample.hybridRetrieval.webCandidates.at(-1)).toMatchObject({
      status: 'discarded_non_paper',
      identifiedReferenceCount: 0,
    })
    expect(sample.hybridRetrieval.references).toHaveLength(5)
    expect(sample.hybridRetrieval.stages.referenceVerification).toBe('partial_success')
    expect(sample.hybridRetrieval.stages.referenceIdentification).toBe('partial_success')
    expect([...sample.hybridRetrieval.webCandidates, ...sample.hybridRetrieval.references]
      .every(row => row.query === sample.planView.searches[0]?.query)).toBe(true)
  })
})
