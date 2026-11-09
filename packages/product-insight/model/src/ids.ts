/** Product-insight identities use the same branded UUID approach as academic-model. */
import { brandString } from '@deepseek-ai/dsh-brand'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type {
  CandidatePageId, EvidenceGapId, ProductClaimId, ProductEvidenceId, ProductFailureId,
  ProductId, ProductPlanId, ProductQuestionId, ProductReportId, ProductRunId, SourceSnapshotId,
} from './types.ts'

/** Create a product identity independent of its name or homepage.
 * @returns A stable identity for one product.
 */
export function createProductId(): ProductId { return brandString<ProductId>(randomUUID()) }
/** Create the identity shared by revisions of one plan.
 * @returns An identity shared by all versions of one investigation plan.
 */
export function createProductPlanId(): ProductPlanId { return brandString<ProductPlanId>(randomUUID()) }
/** Create a question identity within the investigation.
 * @returns An identity for one plan question.
 */
export function createProductQuestionId(): ProductQuestionId { return brandString<ProductQuestionId>(randomUUID()) }
/** Create an identity independent of subsequent page fetches.
 * @returns An identity for one discovered page.
 */
export function createCandidatePageId(): CandidatePageId { return brandString<CandidatePageId>(randomUUID()) }
/** Create an identity for a source-fetch observation.
 * @returns An identity for one observed page-fetch attempt.
 */
export function createSourceSnapshotId(): SourceSnapshotId { return brandString<SourceSnapshotId>(randomUUID()) }
/** Create an identity for a located source excerpt.
 * @returns An identity for one evidence record.
 */
export function createProductEvidenceId(): ProductEvidenceId { return brandString<ProductEvidenceId>(randomUUID()) }
/** Create an identity for an independently stored conclusion.
 * @returns An identity for one analysis conclusion.
 */
export function createProductClaimId(): ProductClaimId { return brandString<ProductClaimId>(randomUUID()) }
/** Create an identity for a question-specific source gap.
 * @returns An identity for one missing-evidence request.
 */
export function createEvidenceGapId(): EvidenceGapId { return brandString<EvidenceGapId>(randomUUID()) }
/** Create an identity independent of the approved plan.
 * @returns An identity for one investigation run.
 */
export function createProductRunId(): ProductRunId { return brandString<ProductRunId>(randomUUID()) }
/** Create an identity for a generated report artifact.
 * @returns An identity for one report artifact.
 */
export function createProductReportId(): ProductReportId { return brandString<ProductReportId>(randomUUID()) }
/** Create an identity for an observed processing failure.
 * @returns An identity for one observed operation failure.
 */
export function createProductFailureId(): ProductFailureId { return brandString<ProductFailureId>(randomUUID()) }
