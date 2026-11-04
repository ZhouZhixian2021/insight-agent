import { describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderResearchPage } from '../src/client/render.ts'
import { benchmarkReport } from './fixtures.client.ts'

describe('report page interactions', () => {
  it('filters entries, opens cited evidence and downloads the exact Markdown', async () => {
    const report = benchmarkReport()
    let exported: Blob | undefined
    let downloaded = ''
    const dom = new JSDOM(renderResearchPage(report, 'zh-CN'), { runScripts: 'dangerously',
      beforeParse(window) {
        window.Blob = Blob
        window.URL.createObjectURL = vi.fn((blob: Blob) => { exported = blob; return 'blob:fixture' })
        window.URL.revokeObjectURL = vi.fn()
        window.HTMLAnchorElement.prototype.click = function () { downloaded = this.download }
      },
    })
    try {
      const doc = dom.window.document
      const search = doc.getElementById('search') as HTMLInputElement
      search.value = 'not-in-any-evidence'
      search.dispatchEvent(new dom.window.Event('input'))
      expect([...doc.querySelectorAll<HTMLElement>('.searchable')].every(item => item.hidden)).toBe(true)
      search.value = ''
      search.dispatchEvent(new dom.window.Event('input'))
      const link = doc.querySelector('a[href="#evidence-evidence-rag-a"]')
      link?.dispatchEvent(new dom.window.Event('click'))
      expect((doc.getElementById('evidence-evidence-rag-a') as HTMLDetailsElement).open).toBe(true)
      doc.getElementById('download')?.click()
      expect(downloaded).toBe('academic-report.md')
      expect(await exported?.text()).toBe(report.markdown)
    } finally { dom.window.close() }
  })
})
