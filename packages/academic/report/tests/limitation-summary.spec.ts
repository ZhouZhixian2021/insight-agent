import { expect, it } from 'vitest'
import { summarizeReportLimitations } from '../src/index.ts'

it('separates content gaps, normal processing and diagnostic text without adding batch counts', () => {
  const records = [
    '缺少统一实验条件下的准确率，不能进行定量排名。',
    '问题 2：缺少训练稳定性数据。',
    'The desired inclusion target and question coverage are satisfied.',
    '22 returned works have no resolvable full-text candidates; this does not establish that no full text exists.',
    '14 returned works have no resolvable full-text candidates; this does not establish that no full text exists.',
    'unavailable_field: Field is not_extracted; preserve its original availability.',
    'Provider openalex failed during search.',
    'Provider web failed during web_search.',
    'Full-text resolution retains the latest 1000 records in this provider instance; restart or eviction requires discovery again.',
    'Opaque external diagnostic without known semantics.',
  ]
  const before = [...records], result = summarizeReportLimitations([...records, records[0]!])
  expect(result.keyLimitations).toContain(records[0])
  expect(result.questionGaps).toEqual([records[1]])
  expect(result.keyLimitations.some(text => text.includes('目标') || text.includes('1000') || text.includes('36'))).toBe(false)
  expect(result.processingNotes).toHaveLength(1)
  expect(result.diagnostics).toEqual(records)
  expect(result.keyLimitations.filter(text => text.includes('可靠元数据'))).toHaveLength(1)
  expect(result.keyLimitations.filter(text => text.includes('来源调用失败'))).toHaveLength(1)
  expect(result.keyLimitations.some(text => text.includes('未归类'))).toBe(true)
  expect(records).toEqual(before)
})

it('uses only supplied version identities for titles and preserves unsafe raw text for escaped rendering', () => {
  const id = '2161f03a-ffee-4226-bd4c-7c394ddc7e15'
  const excluded = `Excluded version ${id}: 不属于图像分类。`
  const failure = `Version ${id} failed during fulltext.`
  const rejection = `Version ${id}: retained 5 evidence records; rejected 1 drafts during source verification.`
  const records = [excluded, failure, rejection, '<script>not executable</script>']
  const result = summarizeReportLimitations(records, new Map([[id, '固定论文']]))
  expect(result.processingNotes.some(text => text.includes('《固定论文》全文获取失败'))).toBe(true)
  expect(result.processingNotes.join('')).not.toContain(id)
  expect(result.keyLimitations).not.toContain(excluded)
  expect(result.diagnostics).toEqual(records)
  expect(summarizeReportLimitations([failure]).processingNotes[0]).not.toContain('固定论文')
})
