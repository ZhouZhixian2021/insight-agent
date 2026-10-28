import { describe, expect, it } from 'vitest'
import { clientSourceRoot, findUiI18nViolations } from './verify-client-ui-i18n.ts'

function messages(source: string): string[] {
  return findUiI18nViolations('packages/client/ui-example/src/client/View.tsx', source)
    .map(violation => violation.text)
}

describe('Client UI i18n source check', () => {
  it('rejects direct JSX copy and copy-bearing attributes', () => {
    expect(messages(`
      const View = ({ ready }: { ready: boolean }) => <section aria-label="Overview">
        <span>Hard-coded text</span>
        <input placeholder={ready ? 'Search now' : ` + "`Wait ${'${ready}'}`" + `} />
        <div runningSummary="Still working" />
      </section>
    `)).toEqual(['Overview', 'Hard-coded text', 'Search now', 'Wait', 'Still working'])
  })

  it('rejects copy kept in label data and copy helper returns', () => {
    expect(messages(`
      const TABS = [{ id: 'summary', label: 'Summary' }]
      function statusLabel(status: string): string {
        if (status === 'done') return 'Complete'
        return 'Still running'
      }
      function duration(): string { return 'Not recorded' }
      function mode(): string { return 'compact' }
      function displayFailureMessage(): string { return 'API key is invalid' }
      const emptySummary = 'Nothing to show'
      function Dialog({ closeLabel = 'Close dialog' }: { closeLabel?: string }) { return closeLabel }
    `)).toEqual([
      'Summary', 'Complete', 'Still running', 'Not recorded', 'API key is invalid',
      'Nothing to show', 'Close dialog',
    ])
  })

  it('normalizes native separators before deriving a Client source root', () => {
    expect(clientSourceRoot('packages/extensions/sample/src/client/View.tsx'))
      .toBe('packages/extensions/sample/src/client')
    expect(clientSourceRoot('packages\\extensions\\sample\\src\\client\\View.tsx'))
      .toBe('packages/extensions/sample/src/client')
    expect(clientSourceRoot('packages/extensions/sample/src/server/index.ts')).toBeUndefined()
  })

  it('accepts translated copy, dynamic values, structural attributes, and language tokens', () => {
    expect(messages(`
      const View = ({ t, value }: { t: (key: string) => string; value: string }) => (
        <section className="root" role="region" aria-label={t('overview')}>
          <span>{t('status.complete')}</span>
          <code>null</code>
          {value === 'pending' && <output>{value}</output>}
          <output>{value}</output>
        </section>
      )
    `)).toEqual([])
  })

  it('ignores HTML document markup while rejecting visible text and copy attributes', () => {
    const safe = 'function render(title: string): string { return `<!doctype html><html><head><style>body{color:#333}</style></head><body><h1>${title}</h1></body></html>` }'
    expect(messages(safe)).toEqual([])

    const visible = 'function render(): string { return `<!doctype html><html><body><h1>Hard-coded heading</h1></body></html>` }'
    expect(messages(visible)).toHaveLength(1)
    const attribute = 'function render(): string { return `<!doctype html><html><body><nav aria-label="Contents"></nav></body></html>` }'
    expect(messages(attribute)).toHaveLength(1)
  })

  it('checks visible submit, button, and reset input values in HTML documents', () => {
    const html = (body: string) => `function render(label: string): string { return \`<!doctype html><html><body>${body}</body></html>\` }`
    for (const type of ['submit', 'button', 'reset']) {
      expect(messages(html(`<input type="${type}" value="Submit research">`))).toHaveLength(1)
    }
    expect(messages(html('<input value="submit" TYPE=BUTTON>'))).toHaveLength(1)
    expect(messages(html('<input type="text" value="Submit research"><input type="hidden" value="Submit research">')))
      .toEqual([])
    expect(messages(html('<input type="submit" value="${label}"><input type="reset" value="123">')))
      .toEqual([])
  })

  it('does not inspect locale dictionary owners', () => {
    expect(findUiI18nViolations(
      'packages/client/ui-example/src/client/locales.ts',
      'export const en = { title: "Hard-coded by design" }',
    )).toEqual([])
  })

  it('rejects Electron dialog, title, prompt, and DOM copy outside locale owners', () => {
    const source = `
      dialog.showMessageBox({ title: 'Update available', message: 'Install it now?' })
      window.setTitle('Desktop plugins')
      window.prompt('Target version')
      status.textContent = 'Finished'
    `
    expect(findUiI18nViolations('apps/desktop/src/main.ts', source).map(row => row.text)).toEqual([
      'Update available',
      'Install it now?',
      'Desktop plugins',
      'Target version',
      'Finished',
    ])
  })
})
