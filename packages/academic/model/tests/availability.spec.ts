import { brandString } from '@deepseek-ai/dsh-brand'
import { describe, expect, it } from 'vitest'

import { isAvailable, type Availability, type FailureId } from '../src/index.ts'

describe('isAvailable', () => {
  it('accepts only a record containing a usable value', () => {
    const records: Availability<string>[] = [
      { status: 'available', value: 'abstract' },
      { status: 'unknown', reason: 'provider omitted the field' },
      { status: 'not_applicable', reason: 'field does not apply' },
      { status: 'not_extracted' },
      {
        status: 'failed',
        failureId: brandString<FailureId>('failure-1'),
        reason: 'parser error',
      },
    ]

    expect(records.map(record => isAvailable(record))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ])
  })
})
