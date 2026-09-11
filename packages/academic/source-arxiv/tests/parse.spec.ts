import { describe, expect, it } from 'vitest'

import { normalizeArxivWork, parseArxivFeed } from '../src/index.ts'

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2406.12345v1</id>
    <title>Joint evaluation of retrieval and generation</title>
    <published>2024-06-15T12:34:56Z</published>
    <author><name>Alice Example</name></author>
    <author><name>Bob Researcher</name></author>
    <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.48550/arXiv.2406.12345</arxiv:doi>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`

describe('parseArxivFeed', () => {
  it('distills one entry with authors and a DOI', () => {
    const entries = parseArxivFeed(FEED)
    expect(entries).toEqual([{
      id: 'http://arxiv.org/abs/2406.12345v1',
      title: 'Joint evaluation of retrieval and generation',
      authors: ['Alice Example', 'Bob Researcher'],
      published: '2024-06-15T12:34:56Z',
      doi: '10.48550/arXiv.2406.12345',
    }])
  })

  it('returns an empty list for a feed without entries', () => {
    expect(parseArxivFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toEqual([])
  })
})

describe('normalizeArxivWork', () => {
  it('translates an entry as a preprint with arxiv and doi identifiers', () => {
    const entry = parseArxivFeed(FEED)[0]!
    const { academicWork, workVersion } = normalizeArxivWork(entry)

    expect(academicWork.title).toBe('Joint evaluation of retrieval and generation')
    expect(academicWork.authors).toEqual(['Alice Example', 'Bob Researcher'])
    expect(academicWork.externalIdentifiers).toEqual([
      { kind: 'arxiv', normalizedValue: '2406.12345', originalValue: 'http://arxiv.org/abs/2406.12345v1', sourceProvider: 'arxiv' },
      { kind: 'doi', normalizedValue: '10.48550/arxiv.2406.12345', originalValue: '10.48550/arXiv.2406.12345', sourceProvider: 'arxiv' },
    ])
    expect(academicWork.publicationStatus).toEqual({ status: 'available', value: 'preprint' })
    expect(academicWork.venue).toEqual({ status: 'unknown', reason: 'arXiv entry names no journal venue.' })
    expect(workVersion.versionType).toBe('preprint')
    expect(workVersion.sourceRecords).toEqual([{ provider: 'arxiv', recordId: '2406.12345' }])
  })
})
