/** Failure that prevents a workflow from continuing without durable model records. */
export class WorkflowLogError extends Error {
  /** Stable caller-visible classification; this failure must stop the whole research pass. */
  readonly code = 'ACADEMIC_WORKFLOW_LOG_FAILED'

  /**
   * Wrap the append or durability failure without copying its details into report text.
   * @param cause - underlying Session append, missing checkpoint or storage failure.
   */
  constructor(cause: unknown) {
    super('Academic model records could not be saved; research stopped.', { cause })
    this.name = 'WorkflowLogError'
  }
}
