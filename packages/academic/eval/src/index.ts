/** Evidence integrity and reviewer-aware assessment; reference existence is not semantic proof. */
import { checkClaimFreshness, createClaimAssessmentId, isExecutableResearchBrief,
  type ClaimRecord, type ClaimEvidenceLink, type ClaimAssessment, type ResearchBrief,
  type EvidenceRecord, type WorkVersion, type ClaimId, type SourceLocator,
} from '@deepseek-ai/dsh-academic-model'

/** Explicit inputs for evaluation; reviews are supplied by a human or separately validated evaluator. */
export interface EvaluationInput {
  readonly brief: ResearchBrief
  readonly claims: readonly ClaimRecord[]
  readonly links: readonly ClaimEvidenceLink[]
  /** Validated single-paper statements; each retains all support, opposition and background links. */
  readonly sourceStatements?: readonly { readonly evidenceLinks: readonly Pick<ClaimEvidenceLink, 'evidenceId' | 'relation'>[] }[]
  readonly evidence: readonly EvidenceRecord[]
  readonly versions: readonly WorkVersion[]
  readonly sourceLocators: readonly SourceLocator[]
  readonly reviews: readonly ClaimAssessment[]
  readonly assessedAt: string
}

/** Located structural or semantic-review issue. */
export interface EvaluationIssue {
  readonly claimId: ClaimId | null
  readonly code: string
  readonly message: string
}

/** Ready requires structural checks, evidence thresholds, and explicit supporting reviews. */
export interface EvaluationResult {
  readonly status: 'ready' | 'needs_review' | 'blocked'
  readonly assessments: readonly ClaimAssessment[]
  readonly issues: readonly EvaluationIssue[]
}

/**
 * Recheck current evidence and reviewer decisions before report delivery.
 * @param input Current records and explicit semantic reviews; an empty reviews array means unreviewed.
 * @returns Fresh assessments and issues; never upgrades reference checks to semantic support.
 */
export function evaluateClaims(input: EvaluationInput): EvaluationResult {
  const evidence = new Map(input.evidence.map(record => [record.evidenceId, record]))
  const versions = new Map(input.versions.map(version => [version.workVersionId, version]))
  const locators = new Map(input.sourceLocators.map(locator => [locator.sourceLocatorId, locator]))
  const issues: EvaluationIssue[] = []
  const assessments: ClaimAssessment[] = []
  let blocked = false
  const add = (claimId: ClaimId | null, code: string, message: string): void => { issues.push({ claimId, code, message }) }
  if (evidence.size !== input.evidence.length || versions.size !== input.versions.length || locators.size !== input.sourceLocators.length
    || new Set(input.claims.map(claim => claim.claimId)).size !== input.claims.length
    || new Set(input.links.map(link => link.claimEvidenceLinkId)).size !== input.links.length) {
    blocked = true
    add(null, 'duplicate_identity', 'Duplicate identities make evaluation ambiguous.')
  }
  if (!isExecutableResearchBrief(input.brief)) {
    blocked = true
    add(null, 'brief_not_approved', 'The current brief version is not approved.')
  }
  const sourceStatements = input.sourceStatements ?? []
  if (input.claims.length === 0 && sourceStatements.length === 0) { blocked = true; add(null, 'no_claims', 'No cross-paper conclusions are available.') }
  const claimed = new Set(input.claims.map(claim => claim.claimId))
  if (input.links.some(link => !claimed.has(link.claimId))) {
    blocked = true
    add(null, 'orphan_link', 'An evidence link references a missing claim.')
  }
  const citedWorks = new Set<string>()
  const fulltextWorks = new Set<string>()
  function checkEvidence(links: readonly Pick<ClaimEvidenceLink, 'evidenceId' | 'relation'>[], claimId: ClaimId | null): void {
    for (const link of links) {
      const record = evidence.get(link.evidenceId)
      if (!record) { add(claimId, 'missing_evidence', `Evidence ${link.evidenceId} is missing.`); continue }
      const version = versions.get(record.workVersionId)
      const locator = locators.get(record.sourceLocatorId)
      if (!locator || locator.workVersionId !== record.workVersionId) add(claimId, 'invalid_locator', 'Evidence locator is missing or refers to another version.')
      if (locator) {
        const level = locator.kind === 'provider_record' ? 'metadata' : locator.kind === 'abstract' ? 'abstract' : 'fulltext'
        if (record.level !== level) add(claimId, 'invalid_locator_level', 'Evidence level and locator kind disagree.')
        if (locator.contentHash !== null && record.contentHash.status === 'available' && locator.contentHash !== record.contentHash.value) {
          add(claimId, 'locator_hash_mismatch', 'Evidence and locator hashes disagree.')
        }
      }
      if (!version || version.academicWorkId !== record.academicWorkId || version.status === 'retracted'
        || version.versionType === 'retracted') add(claimId, 'invalid_version', 'Evidence version is missing, mismatched or retracted.')
      if (version?.contentHash.status === 'available' && record.contentHash.status === 'available'
        && version.contentHash.value !== record.contentHash.value) add(claimId, 'version_hash_mismatch', 'Version and evidence hashes disagree.')
      if (!input.brief.evidenceRequirements.allowPreprints && version?.versionType === 'preprint') add(claimId, 'preprint_disallowed', 'The brief excludes preprints.')
      if (record.level === 'metadata') add(claimId, 'metadata_only', 'Metadata does not support substantive conclusions.')
      if (input.brief.evidenceRequirements.minimumEvidenceLevel === 'fulltext' && record.level !== 'fulltext') add(claimId, 'fulltext_required', 'The brief requires full-text evidence.')
      if (record.verbatimExcerpt.status !== 'available') add(claimId, 'excerpt_unavailable', 'Semantic review requires the original excerpt.')
      if (link.relation === 'supports') {
        citedWorks.add(record.academicWorkId)
        if (record.level === 'fulltext') fulltextWorks.add(record.academicWorkId)
      }
    }
  }
  for (const statement of sourceStatements) {
    const before = issues.length
    if (!statement.evidenceLinks.some(link => link.relation === 'supports')) {
      add(null, 'no_source_support', 'A source statement requires supporting evidence.')
    }
    checkEvidence(statement.evidenceLinks, null)
    if (issues.length > before) blocked = true
  }
  if (sourceStatements.length > 0) add(null, 'source_statement_review_required', 'Attributed source statements still require independent semantic review.')
  for (const claim of input.claims) {
    const before = issues.length
    const claimLinks = input.links.filter(link => link.claimId === claim.claimId)
    const snapshotIds = new Set(claim.evidenceSnapshot.evidenceItems.map(item => item.evidenceId))
    const linkIds = new Set(claimLinks.map(link => link.evidenceId))
    if (snapshotIds.size !== claim.evidenceSnapshot.evidenceItems.length
      || snapshotIds.size !== linkIds.size || [...snapshotIds].some(id => !linkIds.has(id))) {
      add(claim.claimId, 'snapshot_links_mismatch', 'Snapshot evidence and linked evidence must match exactly.')
    }
    const freshness = checkClaimFreshness(claim, input.brief, evidence)
    if (freshness.status !== 'current') add(claim.claimId, freshness.status, freshness.reasons.join(' '))
    const supporting = claimLinks.filter(link => link.relation === 'supports')
    if (supporting.length === 0) add(claim.claimId, 'no_support', 'Background or opposing evidence alone does not support a claim.')
    checkEvidence(claimLinks, claim.claimId)
    const integrityFailed = issues.length > before
    if (integrityFailed) blocked = true
    const reviews = input.reviews.filter(review => review.claimId === claim.claimId)
    const review = reviews.length === 1 ? reviews[0] : undefined
    const reviewMatches = review !== undefined && review.method.trim() !== '' && review.methodVersion.trim() !== ''
      && review.reason.trim() !== '' && new Set(review.assessedEvidenceIds).size === snapshotIds.size
      && review.assessedEvidenceIds.every(id => snapshotIds.has(id))
    let status: ClaimAssessment['status'] = integrityFailed ? 'insufficient' : 'partially_supported'
    if (!integrityFailed && reviewMatches) status = review.status
    if (!integrityFailed && !reviewMatches) add(claim.claimId, 'semantic_review_required', 'References pass; semantic support still requires a review of the same evidence.')
    if (claimLinks.some(link => link.relation === 'contradicts') && claim.uncertainty === null) {
      status = 'insufficient'
      add(claim.claimId, 'undisclosed_conflict', 'Opposing evidence requires explicit uncertainty.')
    }
    if (claim.confidence === 'insufficient' || claim.confidenceReasons.every(reason => reason.trim() === '')) {
      status = 'insufficient'
      add(claim.claimId, 'insufficient_confidence', 'The claim has insufficient confidence or no confidence rationale.')
    }
    if (status === 'unsupported' || status === 'contradicted' || status === 'insufficient') blocked = true
    assessments.push({ schemaVersion: 1, claimAssessmentId: createClaimAssessmentId(), claimId: claim.claimId,
      status, reason: integrityFailed ? issues.slice(before).map(issue => issue.message).join(' ')
        : reviewMatches ? review.reason : 'Structural checks passed; semantic support is not yet independently reviewed.',
      method: reviewMatches ? `integrity+${review.method}` : 'evidence-integrity-only',
      methodVersion: reviewMatches ? `1/${review.methodVersion}` : '1',
      assessedEvidenceIds: [...snapshotIds], assessedAt: input.assessedAt })
  }
  if (citedWorks.size < input.brief.evidenceRequirements.minimumIncludedWorks
    || fulltextWorks.size < input.brief.evidenceRequirements.minimumFulltextWorks) {
    add(null, 'insufficient_coverage', 'Cited work or full-text counts do not meet the approved brief.')
    blocked = true
  }
  return { status: blocked ? 'blocked' : sourceStatements.length === 0 && assessments.every(a => a.status === 'supported') ? 'ready' : 'needs_review', assessments, issues }
}
