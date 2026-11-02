/** Package references remain checked alongside preset data, wire events, and recorded npm evidence. */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { exactEditState, isRescopeExcluded, rewriteRescopeReferences } from './rescope-vendor.ts'

const ANCHOR = '\n## Sync procedure'
const INSERTED = `\n15. **rescope**: one log entry.\n${ANCHOR}`

describe('rescope file selection', () => {
  it('preserves the recorded npm resolution', () => {
    expect(isRescopeExcluded('scripts/dependency-catalog/package-lock.json')).toBe(true)
  })

  it('preserves this scanner\'s deliberate old-name fixtures', () => {
    expect(isRescopeExcluded('scripts/rescope-vendor.spec.ts')).toBe(true)
  })

  it.each([
    'scripts/dependency-catalog/package.json',
    'scripts/dependency-catalog/source.ts',
    'scripts/other/package-lock.json',
    'packages/example/src/index.ts',
    'packages/example/package.json',
  ])('keeps %s subject to upstream package-name checks', (file) => {
    expect(isRescopeExcluded(file)).toBe(false)
  })
})

const IDENTIFIER_FILES = [
  'apps/cli/tests/optional-bundle-transitions.e2e.ts',
  'apps/web/tests/agent-preset-selection.e2e.ts',
  'apps/web/tests/developer-tools-settings.e2e.ts',
  'packages/client/ui-agent-preset/src/client/CreatePluginMenuItem.tsx',
  'packages/client/ui-agent-preset/tests/components.client.spec.tsx',
  'packages/client/ui-agent-preset/tests/create-plugin-menu-item.client.spec.tsx',
  'packages/client/ui-agent-preset/tests/section-store.client.spec.ts',
  'docs/subsystems/schedule.md',
  'docs/subsystems/schedule.zh.md',
  'docs/upgrade-guide/v0.2.0-rc.2/schedule-bundle-retired/guide.md',
  'docs/upgrade-guide/v0.2.0-rc.2/schedule-bundle-retired/guide.zh.md',
  'docs/upgrade-guide/v0.2.1-alpha.1/subagent-preset-composition/guide.md',
  'docs/upgrade-guide/v0.2.1-alpha.1/subagent-preset-composition/guide.zh.md',
  'docs/user/guide/schedule.md',
  'docs/user/guide/schedule.zh.md',
  'packages/bundle/web-app/cordis.patch.yml',
  'packages/extensions/cordis-host-runner/tests/inspect-registry.spec.ts',
  'snapshots/session/cordis-inspect-liveness/client-fixture.mjs',
  'snapshots/session/cordis-inspect-timeout/client-fixture.mjs',
] as const

describe('package references beside product identifiers', () => {
  it.each(IDENTIFIER_FILES)('preserves existing identifiers in %s without excluding the file', (file) => {
    expect(isRescopeExcluded(file)).toBe(false)
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    expect(rewriteRescopeReferences(text, file)).toEqual({ text, lines: 0 })
  })

  it.each(IDENTIFIER_FILES)('detects a new old package reference in %s', (file) => {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    const reference = file.endsWith('.md')
      ? "\n```ts\nimport { Context } from 'cordis'\n```\n"
      : file.endsWith('.yml') ? "\n- name: 'cordis'\n" : "\nimport { Context } from 'cordis'\n"
    const expected = reference.replace("'cordis'", "'@deepseek-ai/cordis'")
    expect(rewriteRescopeReferences(text + reference, file)).toEqual({ text: text + expected, lines: 1 })
  })

  it('preserves multiple preset values on a CRLF line while rewriting a package on that line', () => {
    const file = 'packages/client/ui-agent-preset/tests/components.client.spec.tsx'
    const text = "import 'cosmokit'; const options = [{ id: 'cordis' }, { id: 'cordis' }]; require('cordis')\r\n"
    expect(rewriteRescopeReferences(text, file)).toEqual({
      text: "import '@deepseek-ai/cosmokit'; const options = [{ id: 'cordis' }, { id: 'cordis' }]; require('@deepseek-ai/cordis')\r\n",
      lines: 1,
    })
  })

  it('preserves an inspect listener while rewriting an identical package specifier', () => {
    const file = 'snapshots/session/cordis-inspect-timeout/client-fixture.mjs'
    const text = "ctx.on('cordis/inspect-query', handler); import('cordis/inspect-query')\n"
    expect(rewriteRescopeReferences(text, file)).toEqual({
      text: "ctx.on('cordis/inspect-query', handler); import('@deepseek-ai/cordis/inspect-query')\n",
      lines: 1,
    })
  })

  it('keeps package references in prose on the same line as a preset list checked', () => {
    const file = 'docs/subsystems/schedule.md'
    const text = 'The `standard`, `cordis`, and `ptc` presets use the `cordis` package.\n'
    expect(rewriteRescopeReferences(text, file)).toEqual({
      text: 'The `standard`, `cordis`, and `ptc` presets use the `@deepseek-ai/cordis` package.\n',
      lines: 1,
    })
  })

  it('does not exempt a preset list inside a Markdown code fence', () => {
    const text = '```ts\nconst packages = [`standard`, `cordis`, `ptc`]\n```\n'
    expect(rewriteRescopeReferences(text, 'docs/subsystems/schedule.md').lines).toBe(1)
  })

  it('does not exempt backticks inside an actual YAML name value', () => {
    const text = '- name: "`standard`, `cordis`, and `ptc`"\n'
    expect(rewriteRescopeReferences(text, 'packages/bundle/web-app/cordis.patch.yml').lines).toBe(1)
  })

  it.each([
    "const packageName = 'cordis'",
    "const packages = ['cordis']",
    "const plugin = { name: 'cordis' }",
    "other.on('cordis', handler)",
    "const packagePath = 'cordis/inspect-query'",
    "ctx.on('cordis/other-event', handler)",
  ])('keeps an unrecognized use checked: %s', (text) => {
    for (const file of [IDENTIFIER_FILES[3], IDENTIFIER_FILES[16]]) {
      expect(rewriteRescopeReferences(text, file).lines).toBe(1)
    }
  })

  it('does not extend identifier exceptions to unrelated files', () => {
    const text = "const option = { id: 'cordis' }; ctx.on('cordis/inspect-query', handler)"
    expect(rewriteRescopeReferences(text, 'packages/example/src/index.ts')).toEqual({
      text: "const option = { id: '@deepseek-ai/cordis' }; ctx.on('@deepseek-ai/cordis/inspect-query', handler)",
      lines: 1,
    })
  })
})

const PACKAGE_NAMES = [
  ['cordis', '@deepseek-ai/cordis'],
  ['cosmokit', '@deepseek-ai/cosmokit'],
  ['schemastery', '@deepseek-ai/schemastery'],
  ...['loader', 'include', 'group', 'timer', 'hmr', 'logger-console'].map(name =>
    [`@cordisjs/plugin-${name}`, `@deepseek-ai/cordis-plugin-${name}`]),
]

describe('old package-name detection', () => {
  it.each(PACKAGE_NAMES)('detects %s in module, manifest, and plugin references', (upstream, scoped) => {
    const sources = [
      `import { Context } from '${upstream}'`,
      `import type { Context } from "${upstream}"`,
      `import '${upstream}'`,
      `export * from '${upstream}'`,
      `declare module '${upstream}' {}`,
      `type Context = import('${upstream}').Context`,
      `const pending = import('${upstream}')`,
      `const loaded = require('${upstream}')`,
      `const path = require.resolve('${upstream}')`,
      `const path = import.meta.resolve('${upstream}')`,
      `const pending = import(\`${upstream}\`)`,
      `import legacy = require('${upstream}')`,
      `import '${upstream}/subpath'`,
    ]
    for (const file of [IDENTIFIER_FILES[3], IDENTIFIER_FILES[16], 'packages/example/src/index.ts']) {
      for (const source of sources) {
        const result = rewriteRescopeReferences(source, file)
        expect(result).toEqual({ text: source.replace(upstream, scoped), lines: 1 })
        expect(rewriteRescopeReferences(result.text, file)).toEqual({ text: result.text, lines: 0 })
        expect(rewriteRescopeReferences(result.text, file, true)).toEqual({ text: source, lines: 1 })
      }
    }
    for (const [file, source] of [
      ['packages/example/package.json', `{"dependencies":{"${upstream}":"workspace:~"}}`],
      ['packages/bundle/web-app/cordis.patch.yml', `- name: '${upstream}'`],
      ['packages/bundle/web-app/cordis.patch.yml', `- name: ${upstream}`],
      ['docs/subsystems/schedule.md', `Install the \`${upstream}\` package.`],
    ] as const) {
      expect(rewriteRescopeReferences(source, file)).toEqual({ text: source.replace(upstream, scoped), lines: 1 })
    }
  })
})

describe('exactEditState', () => {
  it('classifies an insertion by its target form, so a duplicate is invalid', () => {
    expect(exactEditState(`log\n${ANCHOR}\n`, ANCHOR, INSERTED, 1)).toBe('pending')
    expect(exactEditState(`log${INSERTED}\n`, ANCHOR, INSERTED, 1)).toBe('applied')
    // The anchor survives an insertion, so counting the source form would have
    // called this pending and inserted the entry a second time.
    expect(exactEditState(`log${INSERTED}${INSERTED}\n`, ANCHOR, INSERTED, 1)).toBe('invalid')
    expect(exactEditState('log\n', ANCHOR, INSERTED, 1)).toBe('invalid')
  })

  it('classifies a deletion by its source form, and requires its remainder to survive', () => {
    const remainder = 'exclude:\n'
    const withEntries = 'exclude:\n  - cordis@4\n'
    expect(exactEditState(withEntries, withEntries, remainder, 1)).toBe('pending')
    expect(exactEditState(remainder, withEntries, remainder, 1)).toBe('applied')
    // Upstream dropped the whole field: the source form is gone, but so is the
    // remainder, so this is a moved site rather than a completed deletion.
    expect(exactEditState('unrelated:\n', withEntries, remainder, 1)).toBe('invalid')
  })

  it('requires a replacement to leave no source form and the exact target count', () => {
    expect(exactEditState('a = 1\n', 'a = 1', 'b = 2', 1)).toBe('pending')
    expect(exactEditState('b = 2\n', 'a = 1', 'b = 2', 1)).toBe('applied')
    expect(exactEditState('b = 2\nb = 2\n', 'a = 1', 'b = 2', 1)).toBe('invalid')
    // A moved or partially applied site: neither state is complete.
    expect(exactEditState('a = 1\nb = 2\n', 'a = 1', 'b = 2', 1)).toBe('invalid')
    expect(exactEditState('x\n', 'a = 1', 'b = 2', 1)).toBe('invalid')
  })
})
