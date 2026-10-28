import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { findConcreteTermViolations } from './verify-concrete-terms.ts'
import { findRepositoryReferences } from './verify-repository-references.ts'
import {
  checkRetainedDocumentFindings, documentFindingDigest, documentTextDigest, reviewRetainedDocumentFindings,
  type DocumentFinding, type RetainedDocumentEntry,
} from './retained-document-findings.ts'

const term = 'prove' + 'nance'
const file = 'sample.md'
const source = `before\n${term}\nafter\n`
const finding = { file, line: 2 }
const entry: RetainedDocumentEntry = {
  gate: 'concrete-term', file, reason: 'frozen-sample', fileSha256: documentTextDigest(source),
  matches: [{ kind: 'concrete-term', contextSha256: documentFindingDigest(finding, source), count: 1 }],
}

function review(text: string, entries: RetainedDocumentEntry[] = [entry]) {
  return reviewRetainedDocumentFindings('concrete-term', findConcreteTermViolations(file, text),
    new Map([[file, text]]), entries)
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-retained-docs-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) })
  function write(path: string, text: string) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  write('scripts/retained-document-findings.json', JSON.stringify({ version: 1, entries: [entry] }))
  write(file, source)
  return { root, write }
}

describe('exact retained documentation findings', () => {
  it('accepts only the registered context and multiplicity', () => {
    expect(review(source)).toEqual({ unregistered: [], errors: [], retained: 1 })
    expect(review(source.replaceAll('\n', '\r\n'))).toEqual({ unregistered: [], errors: [], retained: 1 })
  })

  it('rejects a new finding in a registered file or another file', () => {
    expect(review(`${source}${term}\n`).unregistered).toHaveLength(1)
    const other = { file: 'other.md', line: 2 }
    expect(reviewRetainedDocumentFindings('concrete-term', [other], new Map([['other.md', source]]), [entry])
      .unregistered).toEqual([other])
  })

  it('rejects changed context, duplicate occurrences, and stale entries', () => {
    expect(review(source.replace('before', 'changed')).unregistered).toHaveLength(1)
    expect(review(source + source).errors.some(error => error.includes('retained count 2'))).toBe(true)
    expect(review(source.replace(term, 'source')).errors.some(error => error.includes('retained count 0'))).toBe(true)
    expect(reviewRetainedDocumentFindings('concrete-term', [], new Map(), [entry]).errors)
      .toContain(`${file}: retained file is missing`)
  })

  it('pins the whole frozen file even when the finding context is unchanged', () => {
    const result = review(`${source}unrelated addition\n`)
    expect(result.unregistered).toEqual([])
    expect(result.errors).toContain(`${file}: retained file digest changed`)
  })

  it('allows line shifts only for files without a whole-file pin', () => {
    const { fileSha256: _pin, ...fields } = entry
    const unpinned: RetainedDocumentEntry = { ...fields, reason: 'visible-text' }
    expect(review(`intro\n${source}`, [unpinned]).errors).toEqual([])
    expect(review(`intro\n${source}`).errors).toContain(`${file}: retained file digest changed`)
  })

  it('rejects duplicate entries, duplicate contexts, and a different detector kind', () => {
    expect(review(source, [entry, entry]).errors).toContain(`${file}: duplicate retained file entry`)
    expect(review(source, [{ ...entry, matches: [...entry.matches, ...entry.matches] }]).errors)
      .toContain(`${file}: duplicate retained context`)
    expect(review(source, [{ ...entry, matches: [{ ...entry.matches[0]!, kind: 'commit-hash' }] }]).errors)
      .toContain(`${file}: retained finding belongs to another detector`)
  })

  it('keeps path findings distinct from line findings', () => {
    const path = `${term}.md`
    const pathFinding = { file: path, line: null }
    const retained: RetainedDocumentEntry = { ...entry, file: path, matches: [{
      kind: 'concrete-term', contextSha256: documentFindingDigest(pathFinding, source), count: 1,
    }] }
    const result = reviewRetainedDocumentFindings('concrete-term', findConcreteTermViolations(path, source),
      new Map([[path, source]]), [retained])
    expect(result.retained).toBe(1)
    expect(result.unregistered).toEqual([{ file: path, line: 2 }])
  })

  it('loads the registry and rejects malformed or missing registrations', () => {
    const { root, write } = fixture()
    expect(checkRetainedDocumentFindings(root, 'concrete-term', [finding]).errors).toEqual([])
    for (const invalid of [
      { version: 2, entries: [entry] },
      { version: 1, entries: [{ ...entry, file: '../sample.md' }] },
      { version: 1, entries: [{ ...entry, reason: '' }] },
      { version: 1, entries: [{ ...entry, matches: [{ ...entry.matches[0], count: 0 }] }] },
      { version: 1, entries: [{ ...entry, fileSha256: 'invalid' }] },
      { version: 1, entries: [{ ...entry, fileSha256: undefined }] },
      { version: 1, entries: [entry], allowAll: true },
    ]) {
      write('scripts/retained-document-findings.json', JSON.stringify(invalid))
      expect(() => checkRetainedDocumentFindings(root, 'concrete-term', [finding])).toThrow()
    }
    rmSync(join(root, 'scripts/retained-document-findings.json'))
    expect(() => checkRetainedDocumentFindings(root, 'concrete-term', [finding])).toThrow()
  })

  it.each(['concrete-term', 'repository-reference'] as const)(
    'the %s command accepts the exact fixture and rejects additions and stale entries', (gate) => {
      const { root, write } = fixture()
      const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }
      const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim()
      git('init', '--quiet')
      write('.gitignore', 'node_modules/\n')
      for (const path of ['AGENTS.md', 'packages/example.txt', 'docs/example.txt', 'vendor/example.txt',
        '.agents/notes/archived/example.txt']) write(path, 'fixture\n')
      git('add', '.')
      git('commit', '--quiet', '-m', 'fixture')
      const commit = git('rev-parse', 'HEAD')
      const fixtureSource = gate === 'concrete-term' ? source : `before\n${commit}\nafter\n`
      const findings: DocumentFinding[] = gate === 'concrete-term'
        ? findConcreteTermViolations(file, fixtureSource)
        : findRepositoryReferences(file, fixtureSource, new Set([commit]))
      const registration: RetainedDocumentEntry = { ...entry, gate,
        fileSha256: documentTextDigest(fixtureSource), matches: findings.map(item => ({
          kind: item.kind ?? 'concrete-term', contextSha256: documentFindingDigest(item, fixtureSource), count: 1,
        })) }
      write(file, fixtureSource)
      write('scripts/retained-document-findings.json', JSON.stringify({ version: 1, entries: [registration] }))
      for (const script of ['retained-document-findings.ts', 'verify-concrete-terms.ts',
        'verify-repository-references.ts', 'verify-public-repository-links.ts', 'historical-schema-region.ts']) {
        copyFileSync(resolve(import.meta.dirname, script), join(root, 'scripts', script))
      }
      symlinkSync(resolve(import.meta.dirname, '../node_modules'), join(root, 'node_modules'),
        process.platform === 'win32' ? 'junction' : 'dir')
      write('package.json', '{"type":"module"}\n')
      git('add', '.')
      const command = gate === 'concrete-term' ? 'verify-concrete-terms.ts' : 'verify-repository-references.ts'
      const run = () => {
        const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx/esm'), join(root, 'scripts', command)],
          { cwd: root, env, encoding: 'utf8' })
        expect(result.error).toBeUndefined()
        expect(result.signal).toBeNull()
        return result
      }
      const valid = run()
      expect(valid.status, valid.stderr).toBe(0)
      write('docs/new.md', gate === 'concrete-term' ? `${term}\n` : `${commit}\n`)
      git('add', 'docs/new.md')
      const added = run()
      expect(added.status).toBe(1)
      expect(added.stderr).toContain('docs/new.md:1')
      write('docs/new.md', 'clean\n')
      write(file, 'clean\n')
      const stale = run()
      expect(stale.status).toBe(1)
      expect(stale.stderr).toContain('retained count 0')
    },
  )
})
