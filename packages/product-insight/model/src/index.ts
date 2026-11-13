/** Public records and pure rules shared by product-insight packages. */
export type {
  AvailableSourceSnapshot, CandidatePage, CandidatePageId, EvidenceGapId, ExecutableProductPlan,
  Product, ProductBatchResult, ProductBatchStatus, ProductClaim, ProductClaimEvidenceLink,
  ProductClaimEvidenceSnapshot, ProductClaimEvidenceSnapshotItem, ProductClaimId, ProductEvidence,
  ProductEvidenceGap, ProductEvidenceId, ProductEvidenceRelation, ProductFailure, ProductFailureId,
  ProductId, ProductPlan, ProductPlanApproval, ProductPlanId, ProductPlanLimits, ProductQuestion,
  ProductQuestionId, ProductReport, ProductReportDelivery, ProductReportId, ProductRun, ProductRunId,
  ProductSourceCriteria, ProductSourceLocator, ProductSourcePublisher, ProductSourceType,
  SourceSnapshot, SourceSnapshotId,
} from './types.ts'
export {
  createCandidatePageId, createEvidenceGapId, createProductClaimId, createProductEvidenceId,
  createProductFailureId, createProductId, createProductPlanId, createProductQuestionId,
  createProductReportId, createProductRunId, createSourceSnapshotId,
} from './ids.ts'
export { isExecutableProductPlan } from './plan.ts'
export { createProductBatchResult } from './results.ts'
export { checkProductClaimFreshness } from './claim-freshness.ts'
export type { ProductClaimFreshnessCheck } from './claim-freshness.ts'
