/** Released master Trace v1 payload admission, independent of current plugin declarations. */
import type { JSONSchema } from 'zod/v4/core'

const nullableString: JSONSchema.JSONSchema = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const nullableNumber: JSONSchema.JSONSchema = { anyOf: [{ type: 'number' }, { type: 'null' }] }

function object(properties: Record<string, JSONSchema.JSONSchema>): JSONSchema.JSONSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

const duration = object({ value: nullableNumber,
  basis: { enum: ['monotonic', 'wall_clock', 'unknown'] } })

/** Exact AcademicTraceRecord published by master 73849e99cf while its writer was V2. */
export const academicTraceV1Schema: JSONSchema.JSONSchema = object({
  schemaVersion: { const: 1 },
  researchRunId: { type: 'string' },
  span: object({
    spanId: { type: 'string' },
    parentSpanId: nullableString,
    kind: { enum: ['run', 'stage', 'paper', 'call', 'attempt'] },
    stage: { anyOf: [{ enum: ['retrieval', 'screening', 'fulltext', 'extraction', 'analysis', 'report'] }, { type: 'null' }] },
    operation: { enum: ['research', 'stage', 'paper_processing', 'academic_search', 'web_discovery',
      'reference_verification', 'candidate_review', 'fulltext_fetch', 'fulltext_parse', 'scope_review',
      'evidence_extract', 'evidence_validate', 'synthesis', 'report_render', 'tool_call', 'unknown'] },
    academicWorkId: nullableString,
    workVersionId: nullableString,
    providerId: nullableString,
    model: nullableString,
    toolName: nullableString,
    attemptIndex: nullableNumber,
    status: { enum: ['queued', 'running', 'retry_wait', 'succeeded', 'partial_success',
      'failed', 'cancelled', 'skipped', 'unknown'] },
    businessStatus: nullableString,
    startedAt: nullableString,
    endedAt: nullableString,
    timing: object({ queueMs: duration, executionMs: duration, totalMs: duration }),
    failure: { anyOf: [object({
      code: { enum: ['timeout', 'transport', 'output_limit', 'parse', 'validation', 'admission', 'other', 'unknown'] },
      phase: { enum: ['prepare', 'admission', 'before_content', 'after_content', 'parse', 'unknown'] },
      message: { type: 'string' },
    }), { type: 'null' }] },
    gaps: { type: 'array', items: object({ code: { type: 'string' }, field: { type: 'string' }, message: { type: 'string' } }) },
  }),
})
