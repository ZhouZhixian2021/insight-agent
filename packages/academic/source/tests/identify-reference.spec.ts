import { describe, expect, it, vi } from 'vitest'
import { identifyAcademicReferences } from '@deepseek-ai/dsh-academic-source'

describe('identifyAcademicReferences', () => {
  it.each([
    ['DOI', { url: 'https://doi.org/10.1000/SYNTHETIC.1' },
      { kind: 'doi', normalizedValue: '10.1000/synthetic.1', originalValue: '10.1000/SYNTHETIC.1' }],
    ['arXiv PDF', { url: 'https://arxiv.org/pdf/2401.00001v2.pdf' },
      { kind: 'arxiv', normalizedValue: '2401.00001v2', originalValue: '2401.00001v2' }],
    ['ACL paper', { url: 'https://aclanthology.org/2024.synthetic-main.1/' },
      { kind: 'provider_record', provider: 'acl', recordId: '2024.synthetic-main.1' }],
    ['PMLR paper PDF', { url: 'https://proceedings.mlr.press/v235/synthetic24a/synthetic24a.pdf' },
      { kind: 'provider_record', provider: 'pmlr', recordId: 'v235/synthetic24a' }],
    ['PMLR paper page', { url: 'https://proceedings.mlr.press/v235/synthetic24a.html' },
      { kind: 'provider_record', provider: 'pmlr', recordId: 'v235/synthetic24a' }],
    ['CVF paper PDF', { url: 'https://openaccess.thecvf.com/content/CVPR2025/papers/Synthetic_Paper_CVPR_2025_paper.pdf' },
      { kind: 'provider_record', provider: 'cvf',
        recordId: 'https://openaccess.thecvf.com/content/CVPR2025/html/Synthetic_Paper_CVPR_2025_paper.html' }],
    ['CVF workshop paper', { url: 'https://openaccess.thecvf.com/content/CVPR2025W/MEIS/html/Chen_Multi-Agent_Systems_for_Robotic_Autonomy_with_LLMs_CVPRW_2025_paper.html' },
      { kind: 'provider_record', provider: 'cvf',
        recordId: 'https://openaccess.thecvf.com/content/CVPR2025W/MEIS/html/Chen_Multi-Agent_Systems_for_Robotic_Autonomy_with_LLMs_CVPRW_2025_paper.html' }],
  ] as const)('identifies %s', (_name, candidate, reference) => {
    expect(identifyAcademicReferences(candidate)).toEqual({ status: 'identified',
      references: [{ ...reference, discoveryUrl: candidate.url }], issues: [] })
  })

  it.each([
    'https://arxiv.org.evil.example/abs/2401.00001',
    'https://arxiv.org/search/?query=synthetic',
    'https://aclanthology.org/2024.acl-long/',
    'https://proceedings.mlr.press/v235/',
    'https://openaccess.thecvf.com/CVPR2025?day=all',
    'https://openaccess.thecvf.com/content/CVPR2025/papers/not-a-paper.html',
  ])('discards non-paper URL %s', (url) => {
    expect(identifyAcademicReferences({ url })).toMatchObject({ status: 'discarded', references: [],
      issues: [{ code: 'unrecognized_page' }] })
  })

  it.each(['not a URL', 'https://user:pass@arxiv.org/abs/2401.00001',
    'https://arxiv.org/abs/2401', 'https://doi.org/10.1000/'])('rejects invalid reference %s', (url) => {
    expect(identifyAcademicReferences({ url })).toMatchObject({ status: 'discarded', references: [],
      issues: [{ code: 'invalid_reference' }] })
  })

  it('keeps valid references beside an invalid identifier in the snippet', () => {
    const url = 'https://doi.org/10.1000/synthetic.1'
    expect(identifyAcademicReferences({ url, title: 'Synthetic DOI paper',
      snippet: 'The related arXiv identifier 2401 is incomplete.' })).toEqual({
      status: 'identified',
      references: [{ kind: 'doi', normalizedValue: '10.1000/synthetic.1',
        originalValue: '10.1000/synthetic.1', discoveryUrl: url }],
      issues: [{ code: 'invalid_reference', message: 'The arXiv identifier in the snippet is incomplete.' }],
    })
  })

  it('does not guess which of two DOI values names one paper', () => {
    expect(identifyAcademicReferences({ url: 'https://example.test/paper',
      title: 'Synthetic paper DOI 10.1000/first or 10.1000/second' })).toEqual({
      status: 'discarded', references: [],
      issues: [{ code: 'ambiguous_reference', message: 'The Web result does not identify which DOI belongs to the paper.' }],
    })
  })

  it('retains an arXiv URL when the accompanying DOI values are ambiguous', () => {
    expect(identifyAcademicReferences({ url: 'https://arxiv.org/abs/2401.00001',
      title: 'DOI 10.1000/first or 10.1000/second' })).toMatchObject({
      status: 'identified', references: [{ kind: 'arxiv', normalizedValue: '2401.00001' }],
      issues: [{ code: 'ambiguous_reference' }],
    })
  })

  it('retains the official DOI URL when the title mentions another DOI', () => {
    expect(identifyAcademicReferences({ url: 'https://doi.org/10.1000/PRIMARY',
      title: 'DOI 10.1000/primary or 10.1000/secondary' })).toMatchObject({
      status: 'identified', references: [{ kind: 'doi', normalizedValue: '10.1000/primary',
        originalValue: '10.1000/PRIMARY' }], issues: [{ code: 'ambiguous_reference' }],
    })
  })

  it('recognizes an explicit arXiv identifier in a snippet', () => {
    expect(identifyAcademicReferences({ url: 'https://example.test/paper',
      snippet: 'arXiv identifier 2401.00001v2.' })).toMatchObject({
      status: 'identified', references: [{ kind: 'arxiv', normalizedValue: '2401.00001v2' }], issues: [],
    })
  })

  it('finds explicit identifiers in a title and deduplicates a repeated URL identifier', () => {
    const url = 'https://arxiv.org/abs/2401.00001v2'
    expect(identifyAcademicReferences({ url, title: 'arXiv:2401.00001v2; DOI:10.1000/SYNTHETIC.1' })).toEqual({
      status: 'identified', issues: [], references: [
        { kind: 'arxiv', normalizedValue: '2401.00001v2', originalValue: '2401.00001v2', discoveryUrl: url },
        { kind: 'doi', normalizedValue: '10.1000/synthetic.1', originalValue: '10.1000/SYNTHETIC.1',
          discoveryUrl: url },
      ],
    })
  })

  it('preserves DOI spelling without enclosing title punctuation', () => {
    const url = 'https://example.org/paper'
    expect(identifyAcademicReferences({ url, title: 'Paper (doi:10.1000/ABC.1).' })).toEqual({
      status: 'identified', issues: [], references: [{ kind: 'doi', normalizedValue: '10.1000/abc.1',
        originalValue: '10.1000/ABC.1', discoveryUrl: url }],
    })
  })

  it('keeps balanced parentheses inside a DOI', () => {
    expect(identifyAcademicReferences({ url: 'https://example.org/paper',
      title: 'DOI: 10.1000/(ABC)' })).toMatchObject({
      status: 'identified', references: [{ kind: 'doi', normalizedValue: '10.1000/(abc)',
        originalValue: '10.1000/(ABC)' }],
    })
  })

  it('reads a title DOI when the URL has malformed percent encoding', () => {
    expect(identifyAcademicReferences({ url: 'https://example.org/%GG', title: 'DOI: 10.1000/SYNTHETIC' }))
      .toMatchObject({ status: 'identified', references: [{ kind: 'doi', normalizedValue: '10.1000/synthetic' }] })
  })

  it.each([
    ['title', { url: 'https://example.org/paper', title: 'arXiv ID 2401' }],
    ['URL', { url: 'https://example.org/arxiv:2401' }],
  ] as const)('reports an incomplete arXiv identifier in the %s', (location, candidate) => {
    expect(identifyAcademicReferences(candidate)).toEqual({ status: 'discarded', references: [],
      issues: [{ code: 'invalid_reference', message: `The arXiv identifier in the ${location} is incomplete.` }] })
  })

  it('does not fetch the identified page', () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    try {
      identifyAcademicReferences({ url: 'https://aclanthology.org/2024.synthetic-main.1/' })
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      fetch.mockRestore()
    }
  })
})
