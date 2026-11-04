import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  composeEntries, initProfile, loadProfile, loadProfileDirectory,
  readProfileManifest, resolveProfileDir, writeProfileManifest,
} from '../../../boot/app-boot/src/profile.ts'

const anchor = fileURLToPath(new URL('../../../../apps/cli/package.json', import.meta.url))
const base = '@deepseek-ai/dsh-base'
const web = '@deepseek-ai/dsh-web-app'
const academic = '@deepseek-ai/dsh-academic-bundle'

function home(): string {
  const directory = mkdtempSync(join(tmpdir(), 'academic-bundle-'))
  onTestFinished(() => { rmSync(directory, { recursive: true, force: true }) })
  return directory
}

describe('Academic profile composition', () => {
  it('loads the shipped bundle with host, browser and preset entries exactly once', () => {
    const profile = loadProfile('test', 'web', anchor, home())
    expect(profile.skippedBundles).toEqual([])
    expect(profile.layers.map(layer => layer.packageName)).toEqual([base, web, academic])
    const warnings: string[] = []
    const entries = composeEntries(profile.layers.map(layer => layer.patches), warning => warnings.push(warning))
    expect(warnings).toEqual([])
    for (const id of ['academic-source', 'academic-source-arxiv', 'academic-source-openalex',
      'academic-source-acl', 'academic-source-cvf', 'academic-source-pmlr',
      'academic-research-controller', 'ui-academic-research', 'preset-academic']) {
      expect(entries.filter(entry => entry.id === id), id).toHaveLength(1)
    }
    expect(entries.find(entry => entry.id === 'academic-research-controller')?.config).toMatchObject({
      fulltextFetchProvider: 'http', extractionMaxTokens: 16384, synthesisMaxTokens: 32768,
      extractionMaxAttempts: 2, extractionAttemptTimeoutMs: 150000,
    })
    expect(entries.find(entry => entry.id === 'web-fetch-http')?.config).toMatchObject({
      maxResponseBytes: 10000000, maxBodyChars: 5000000, timeoutMs: 120000,
    })
  })

  it('keeps the generic Web composition free of Academic entries', () => {
    const directory = resolveProfileDir('plain-web', home())
    initProfile(directory, [base, web])
    const profile = loadProfileDirectory('test', directory, anchor)
    expect(profile.skippedBundles).toEqual([])
    const entries = composeEntries(profile.layers.map(layer => layer.patches))
    expect(entries.some(entry => entry.name?.includes('academic') || entry.id === 'preset-academic')).toBe(false)
  })

  it('upgrades only the old stock Web tuple and preserves user fields and patches', () => {
    const directory = home()
    const profileDir = resolveProfileDir('web', directory)
    initProfile(profileDir, [base, web])
    writeProfileManifest(profileDir, { ...readProfileManifest('test', profileDir), description: 'User setting' })
    const patch = readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8')
    loadProfile('test', 'web', anchor, directory)
    expect(readProfileManifest('test', profileDir)).toMatchObject({
      description: 'User setting', dsh: { profile: { bundles: [base, web, academic] } },
    })
    expect(readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8')).toBe(patch)
    loadProfile('test', 'web', anchor, directory)
    expect(readProfileManifest('test', profileDir).dsh?.profile?.bundles).toEqual([base, web, academic])
  })

  it('leaves a customized Web bundle list under user control', () => {
    const directory = home()
    const profileDir = resolveProfileDir('web', directory)
    initProfile(profileDir, [base, web, '@deepseek-ai/dsh-headless'])
    loadProfile('test', 'web', anchor, directory)
    expect(readProfileManifest('test', profileDir).dsh?.profile?.bundles)
      .toEqual([base, web, '@deepseek-ai/dsh-headless'])
  })
})
