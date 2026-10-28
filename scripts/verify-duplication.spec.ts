import { expect, it } from 'vitest'
import { compareCloneFingerprints } from './verify-duplication.ts'

it('accepts the exact reviewed clone multiset regardless of JSON key order', () => {
  expect(compareCloneFingerprints({ aaaa: 1, bbbb: 2 }, { bbbb: 2, aaaa: 1 }))
    .toEqual({ added: [], stale: [] })
})

it('rejects a newly duplicated block and an increase in an existing block', () => {
  expect(compareCloneFingerprints({ aaaa: 1 }, { aaaa: 2, bbbb: 1 }))
    .toEqual({ added: ['aaaa +1', 'bbbb +1'], stale: [] })
})

it('requires explicit review when an old block disappears or its count falls', () => {
  expect(compareCloneFingerprints({ aaaa: 2, bbbb: 1 }, { aaaa: 1 }))
    .toEqual({ added: [], stale: ['aaaa -1', 'bbbb -1'] })
})
