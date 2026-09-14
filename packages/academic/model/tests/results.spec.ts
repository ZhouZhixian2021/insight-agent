import { describe, expect, it } from 'vitest'

import {
  createBatchResult,
  createCoverageSummary,
  createFailureId,
  isAvailable,
  type Availability,
  type CoverageSummary,
  type ProviderFailure,
} from '../src/index.ts'

const failure: ProviderFailure = {
  schemaVersion: 1,
  failureId: createFailureId(),
  provider: 'sample-fulltext',
  operation: 'fetch_fulltext',
  category: 'fulltext_unavailable',
  message: 'No accessible full text.',
  retryable: false,
  retryAfter: null,
}

describe('createBatchResult', () => {
  it.each([
    { items: [], failures: [], expected: 'success' },
    { items: ['paper'], failures: [], expected: 'success' },
    { items: ['paper'], failures: [failure], expected: 'partial_success' },
    { items: [], failures: [failure], expected: 'failed' },
  ])('returns $expected for items=$items failures=$failures', ({ items, failures, expected }) => {
    const result = createBatchResult(items, failures)
    expect(result).toEqual({ schemaVersion: 1, status: expected, items, failures })
    expect(result.items).not.toBe(items)
    expect(result.failures).not.toBe(failures)
  })

  it('links failed fields to the retained failure while preserving successful items', () => {
    const field: Availability<string> = { status: 'failed', failureId: failure.failureId, reason: failure.message }
    const result = createBatchResult([{ title: 'Paper', fulltext: field }], [failure])
    expect(result.items[0]?.fulltext).toEqual(field)
    expect(isAvailable(field)).toBe(false)
    expect(result.failures[0]?.failureId).toBe(field.failureId)
    expect(createFailureId()).not.toBe(failure.failureId)
  })
})

const counts: Omit<CoverageSummary, 'schemaVersion'> = {
  discoveredRecords: 4,
  deduplicatedWorks: 3,
  includedWorks: 3,
  availableFulltextWorks: 1,
  abstractOnlyWorks: 1,
  metadataOnlyWorks: 1,
  failedOperations: 1,
  truncated: false,
  limitations: [],
  providerBreakdown: null,
}

describe('createCoverageSummary', () => {
  it('preserves observed counts without filling absent provider statistics', () => {
    expect(createCoverageSummary(counts)).toEqual({ schemaVersion: 1, ...counts })
    const result = createCoverageSummary({ ...counts, truncated: true, limitations: ['Result limit reached.'] })
    expect(result.truncated).toBe(true)
    expect(result.limitations).toEqual(['Result limit reached.'])
    expect(result.providerBreakdown).toBeNull()
  })

  it.each([{ limitations: [] }, { limitations: [' ', '\t'] }])('rejects truncated coverage without a usable reason: $limitations', ({ limitations }) => {
    expect(() => createCoverageSummary({ ...counts, truncated: true, limitations }))
      .toThrow('truncated coverage requires a non-blank limitation')
  })

  it.each([
    'discoveredRecords', 'deduplicatedWorks', 'includedWorks', 'availableFulltextWorks',
    'abstractOnlyWorks', 'metadataOnlyWorks', 'failedOperations',
  ] as const)('rejects invalid %s counts instead of rounding or filling them', (field) => {
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createCoverageSummary({ ...counts, [field]: value })).toThrow(RangeError)
    }
    expect(createCoverageSummary({ ...counts, [field]: 0 })[field]).toBe(0)
  })
})
