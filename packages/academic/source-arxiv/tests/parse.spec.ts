import { describe, expect, it } from 'vitest'

import { arxivFullTextUrls, normalizeArxivWork, parseArxivFeed } from '../src/index.ts'

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2406.12345v1</id>
    <title>Joint evaluation of retrieval and generation</title>
    <published>2024-06-15T12:34:56Z</published>
    <updated>2024-07-01T12:34:56Z</updated>
    <author><name>Alice Example</name></author>
    <author><name>Bob Researcher</name></author>
    <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.48550/arXiv.2406.12345</arxiv:doi>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`

describe('parseArxivFeed', () => {
  it('distills one entry with authors and a DOI', () => {
    const { entries, totalResults } = parseArxivFeed(FEED)
    expect(entries).toEqual([{
      id: 'http://arxiv.org/abs/2406.12345v1',
      title: 'Joint evaluation of retrieval and generation',
      authors: ['Alice Example', 'Bob Researcher'],
      published: '2024-06-15T12:34:56Z',
      updated: '2024-07-01T12:34:56Z',
      doi: '10.48550/arXiv.2406.12345',
    }])
    expect(totalResults).toBeNull()
  })

  it('returns an empty list and a null count for a feed without entries', () => {
    expect(parseArxivFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>'))
      .toEqual({ entries: [], totalResults: null })
  })

  it('reads the opensearch totalResults match count', () => {
    const { entries, totalResults } = parseArxivFeed(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <opensearch:totalResults>6</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
  <opensearch:itemsPerPage>5</opensearch:itemsPerPage>
  <entry>
    <id>http://arxiv.org/abs/2406.12345v1</id>
    <title>Joint evaluation of retrieval and generation</title>
    <published>2024-06-15T12:34:56Z</published>
    <author><name>Alice Example</name></author>
  </entry>
</feed>`)
    expect(entries).toHaveLength(1)
    expect(totalResults).toBe(6)
  })

  it('rejects a malformed totalResults instead of trusting it', () => {
    for (const value of ['not-a-number', '-1', '']) {
      const feed = parseArxivFeed(`<feed xmlns="http://www.w3.org/2005/Atom">
  <totalResults>${value}</totalResults>
  <entry><id>http://arxiv.org/abs/1</id><title>t</title></entry>
</feed>`)
      expect(feed.totalResults).toBeNull()
      expect(feed.entries).toHaveLength(1)
    }
  })

  it('normalizes sparse and repeated entry elements', () => {
    const { entries, totalResults } = parseArxivFeed(`<feed>
      <entry><id>http://arxiv.org/abs/1</id><title type="text"></title><author/></entry>
      <entry><title>missing id</title></entry>
    </feed>`)
    expect(entries).toEqual([{
      id: 'http://arxiv.org/abs/1',
      title: '',
      authors: [],
      published: null,
      updated: null,
      doi: null,
    }])
    expect(totalResults).toBeNull()
  })
})

describe('normalizeArxivWork', () => {
  it('derives version-specific HTML and PDF full-text URLs', () => {
    expect(arxivFullTextUrls('http://arxiv.org/abs/2406.12345v1')).toEqual([
      'https://arxiv.org/html/2406.12345v1',
      'https://arxiv.org/pdf/2406.12345v1',
    ])
    expect(arxivFullTextUrls('math.GT/0309136')).toEqual([
      'https://arxiv.org/html/math.GT/0309136',
      'https://arxiv.org/pdf/math.GT/0309136',
    ])
    expect(() => arxivFullTextUrls('../secret')).toThrow('invalid arXiv id')
  })

  it('translates an entry as a preprint with arxiv and doi identifiers', () => {
    const entry = parseArxivFeed(FEED).entries[0]!
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
    expect(workVersion.versionLabel).toEqual({ status: 'available', value: 'v1' })
    expect(workVersion.releaseDate).toEqual({ status: 'available', value: { iso: '2024-07-01', precision: 'day' } })
    expect(workVersion.externalIdentifiers).toEqual([
      { kind: 'arxiv', normalizedValue: '2406.12345v1', originalValue: 'http://arxiv.org/abs/2406.12345v1', sourceProvider: 'arxiv' },
    ])
    expect(workVersion.sourceRecords).toEqual([{ provider: 'arxiv', recordId: '2406.12345v1' }])
  })

  it('marks the version label unknown when the entry id has no revision suffix', () => {
    const entry = { ...parseArxivFeed(FEED).entries[0]!, id: 'http://arxiv.org/abs/2406.12345' }
    expect(normalizeArxivWork(entry).workVersion.versionLabel).toEqual({
      status: 'unknown',
      reason: 'arXiv entry id carries no version suffix.',
    })
  })

  it('keeps absent publication and update timestamps explicit', () => {
    const entry = {
      ...parseArxivFeed(FEED).entries[0]!,
      published: null,
      updated: null,
    }
    const { academicWork, workVersion } = normalizeArxivWork(entry)
    expect(academicWork.firstPublicDate.status).toBe('unknown')
    expect(workVersion.releaseDate.status).toBe('unknown')
  })
})
