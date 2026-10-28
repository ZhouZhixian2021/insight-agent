import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

interface CoverageSummaryMetric { total: number; covered: number }
type Metric = 'statements' | 'branches' | 'functions' | 'lines'
type CoverageSummary = Record<Metric, CoverageSummaryMetric>
interface ObservedFile { summary: CoverageSummary; sourceSha256: string; uncovered: string[] }
interface DebtFile { sourceSha256: string; uncovered: string[] }
interface Baseline { schema: 1; platform: 'linux' | 'win32'; files: Record<string, DebtFile> }
interface CoverageInput {
  baseline: Baseline
  expectedSources: string[]
  current: Record<string, ObservedFile>
}
interface CoverageFile {
  path: string
  statementMap: Record<string, unknown>
  s: Record<string, number>
  fnMap: Record<string, unknown>
  f: Record<string, number>
  branchMap: Record<string, unknown>
  b: Record<string, number[]>
}
interface DebtGate {
  onEnd: () => void
  current: Record<string, ObservedFile>
}
interface DebtGateModule {
  new (options: Record<string, unknown>): DebtGate
  compareCoverage: (input: CoverageInput) => string[]
  selectPlatformBaseline: (baselines: Record<string, Baseline | string>, platform: string) => Baseline
  sourceInventoryFromGlobs: (options: {
    projectRoot: string
    include: string[]
    exclude: string[]
  }) => string[]
  uncoveredLocations: (coverage: CoverageFile, projectRoot: string) => string[]
}

const gate = createRequire(import.meta.url)('./coverage-debt-gate.cjs') as DebtGateModule
const debtFile = 'packages/academic/workflow/src/pipeline.ts'
const cleanFile = 'packages/academic/workflow/src/entry.ts'
const oldLocation = '10:3 uncovered statement'
const newLocation = '11:3 uncovered statement'
const sourceHash = 'a'.repeat(64)
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-coverage-debt-'))
  roots.push(root)
  return root
}

function summary(gaps: Partial<Record<Metric, number>> = {}): CoverageSummary {
  return {
    statements: { total: 2, covered: 2 - (gaps.statements ?? 0) },
    branches: { total: 2, covered: 2 - (gaps.branches ?? 0) },
    functions: { total: 1, covered: 1 - (gaps.functions ?? 0) },
    lines: { total: 2, covered: 2 - (gaps.lines ?? 0) },
  }
}

function input(): CoverageInput {
  return {
    baseline: {
      schema: 1,
      platform: 'linux',
      files: {
        [debtFile]: {
          sourceSha256: sourceHash,
          uncovered: [oldLocation],
        },
      },
    },
    expectedSources: [debtFile, cleanFile],
    current: {
      [debtFile]: { summary: summary({ statements: 1, lines: 1 }), sourceSha256: sourceHash, uncovered: [oldLocation] },
      [cleanFile]: { summary: summary(), sourceSha256: sourceHash, uncovered: [] },
    },
  }
}

describe('coverage debt comparison', () => {
  it('accepts exact debt while requiring all four metrics at 100% for non-debt files', () => {
    expect(gate.compareCoverage(input())).toEqual([])
  })

  it.each(['statements', 'branches', 'functions', 'lines'] as const)(
    'rejects a new %s gap in a non-debt file', (metric) => {
      const value = input()
      value.current[cleanFile]!.summary[metric].covered -= 1
      expect(gate.compareCoverage(value).join('\n')).toContain(`new ${metric} coverage gap`)
    },
  )

  it('rejects a missing source in the coverage map', () => {
    const value = input()
    value.current = { [debtFile]: value.current[debtFile]! }
    expect(gate.compareCoverage(value).join('\n')).toContain('source is missing from coverage map')
  })

  it('rejects an unexpected source in the coverage map', () => {
    const value = input()
    value.current['packages/new/example/src/extra.ts'] = { summary: summary(), sourceSha256: sourceHash, uncovered: [] }
    expect(gate.compareCoverage(value).join('\n')).toContain('unexpected coverage source')
  })

  it('rejects a new source that did not enter the coverage map', () => {
    const value = input()
    value.expectedSources.push('packages/new/example/src/new.ts')
    expect(gate.compareCoverage(value).join('\n')).toContain('source is missing from coverage map')
  })

  it('rejects stale debt paths removed from the source inventory', () => {
    const value = input()
    value.expectedSources = [cleanFile]
    expect(gate.compareCoverage(value).join('\n')).toContain('stale debt path')
  })

  it('rejects new debt locations while allowing previously uncovered paths to become covered', () => {
    const added = input()
    added.current[debtFile]!.uncovered.push(newLocation)
    expect(gate.compareCoverage(added).join('\n')).toContain('new uncovered location')

    const improved = input()
    improved.current[debtFile]!.uncovered = []
    improved.current[debtFile]!.summary = summary()
    expect(gate.compareCoverage(improved)).toEqual([])
  })

  it('rejects debt source changes even when locations stay fixed', () => {
    const value = input()
    value.current[debtFile]!.sourceSha256 = 'b'.repeat(64)
    expect(gate.compareCoverage(value).join('\n')).toContain('reviewed debt source digest changed')
  })

  it('compares duplicate locations as a multiset', () => {
    const value = input()
    value.baseline.files[debtFile]!.uncovered.push(oldLocation)
    expect(gate.compareCoverage(value)).toEqual([])
    value.current[debtFile]!.uncovered.push(oldLocation, oldLocation)
    expect(gate.compareCoverage(value).join('\n')).toContain('new uncovered location')
  })

  it('rejects an empty or duplicate source inventory', () => {
    const value = input()
    value.expectedSources = []
    expect(() => gate.compareCoverage(value)).toThrow('source inventory is empty')
    value.expectedSources = [cleanFile, cleanFile]
    expect(() => gate.compareCoverage(value)).toThrow('duplicate coverage source inventory path')
  })
})

describe('source inventory and baseline selection', () => {
  it('uses the same include/exclude patterns supplied to Vitest', () => {
    const root = temporaryRoot()
    for (const file of [debtFile, cleanFile, 'packages/academic/workflow/src/entry.tsx']) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), 'export {}\n')
    }
    expect(gate.sourceInventoryFromGlobs({
      projectRoot: root,
      include: ['packages/*/*/src/**/*.{ts,tsx}'],
      exclude: ['packages/*/*/src/entry.tsx'],
    })).toEqual([cleanFile, debtFile].sort())
  })

  it('keeps Linux and Windows baselines separate and fails closed on a missing platform', () => {
    const linux = input().baseline
    const win32: Baseline = { schema: 1, platform: 'win32', files: {} }
    const baselines = { linux, win32 }
    expect(gate.selectPlatformBaseline(baselines, 'linux')).toBe(linux)
    expect(gate.selectPlatformBaseline(baselines, 'win32')).toBe(win32)
    expect(() => gate.selectPlatformBaseline(baselines, 'darwin')).toThrow('unsupported')
    expect(() => gate.selectPlatformBaseline({ linux }, 'win32')).toThrow('missing win32')
    expect(() => gate.selectPlatformBaseline({ linux: win32 }, 'linux')).toThrow('invalid linux')
  })

  it('can load one platform baseline from its own JSON file', () => {
    const root = temporaryRoot()
    const file = join(root, 'linux.json')
    const baseline = input().baseline
    writeFileSync(file, JSON.stringify(baseline))
    expect(gate.selectPlatformBaseline({ linux: file }, 'linux')).toEqual(baseline)
  })
})

describe('Istanbul location fingerprint', () => {
  it('reuses the exact diagnostics visible in the CI log', () => {
    const root = temporaryRoot()
    const file = join(root, 'packages/academic/workflow/src/source.ts')
    mkdirSync(dirname(file), { recursive: true })
    const source = 'const value = 1\nthrow new Error()\n'
    writeFileSync(file, source.replaceAll('\n', '\r\n'))
    const location = { start: { line: 1, column: 0 }, end: { line: 1, column: 15 } }
    const coverage: CoverageFile = {
      path: file,
      statementMap: { 0: location }, s: { 0: 0 },
      fnMap: {}, f: {}, branchMap: {}, b: {},
    }
    expect(gate.uncoveredLocations(coverage, root)).toEqual(['1:1 uncovered statement (to 1:16)'])
    writeFileSync(file, source)
    expect(gate.uncoveredLocations(coverage, root)).toEqual(['1:1 uncovered statement (to 1:16)'])
  })

  it('records unhit statements, functions and branch arms without silently dropping bad locations', () => {
    const root = temporaryRoot()
    const file = join(root, 'packages/academic/workflow/src/source.ts')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, 'if (ready) run()\n')
    const location = { start: { line: 1, column: 0 }, end: { line: 1, column: 16 } }
    const coverage: CoverageFile = {
      path: file,
      statementMap: { 0: location }, s: { 0: 0 },
      fnMap: { 0: { decl: location, loc: location } }, f: { 0: 0 },
      branchMap: { 0: { type: 'if', loc: location, locations: [{}, location] } }, b: { 0: [0, 1] },
    }
    expect(gate.uncoveredLocations(coverage, root)).toEqual([
      '1:1 uncovered branch (if, path 1/2)',
      '1:1 uncovered function',
      '1:1 uncovered statement (to 1:17)',
    ])
    coverage.statementMap[0] = {}
    expect(() => gate.uncoveredLocations(coverage, root)).toThrow('inventory is incomplete')
  })
})

describe('Istanbul reporter exit semantics', () => {
  it('sets a failing exit code when a mapped source is missing', () => {
    const originalExitCode = process.exitCode
    const originalError = console.error
    const errors: string[] = []
    console.error = (...values: unknown[]) => { errors.push(values.join(' ')) }
    try {
      const value = input()
      const reporter = new gate({
        projectRoot: resolve(import.meta.dirname, '..'),
        platform: 'linux',
        baselines: { linux: value.baseline },
        expectedSources: value.expectedSources,
      })
      reporter.current = { [debtFile]: value.current[debtFile]! }
      process.exitCode = 0
      reporter.onEnd()
      expect(process.exitCode).toBe(1)
      expect(errors.join('\n')).toContain('source is missing from coverage map')
    } finally {
      process.exitCode = originalExitCode
      console.error = originalError
    }
  })
})
