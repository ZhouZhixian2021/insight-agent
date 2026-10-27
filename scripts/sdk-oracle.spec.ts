import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import {
  assertSdkOracleReplayMode,
  captureSdkOracleEvidence,
  readSdkOracle,
  sdkOracleSha256,
} from './sdk-oracle.ts'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const scenarioDir = join(repositoryRoot, 'snapshots/sdk/academic-plan-chinese')
const oracleRoot = join(repositoryRoot, 'snapshots/sdk-oracles')

async function temporaryFixture(status: 'pending' | 'active'): Promise<{
  root: string
  scenario: string
  writer: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sdk-oracle-spec-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const scenario = join(root, 'scenario')
  const output = join(root, 'oracle', 'academic-plan-chinese')
  await mkdir(scenario)
  await mkdir(dirname(output))
  const source = await readFile(join(scenarioDir, 'session.v4.jsonl'), 'utf8')
  const writer = status === 'active' ? source.replace('"createdAt":0', '"createdAt":1') : source
  await writeFile(join(scenario, 'session.v4.jsonl'), source)
  const entry: Record<string, string> = {
    status,
    source: 'session.v4.jsonl',
    sourceSha256: sdkOracleSha256(source),
  }
  if (status === 'active') {
    await mkdir(output)
    const prompt = await readFile(join(scenarioDir, 'system-prompt.expected.md'), 'utf8')
    const schemas = await readFile(join(scenarioDir, 'tool-schemas.expected.json'), 'utf8')
    await writeFile(join(output, 'writer.expected.jsonl'), writer)
    await writeFile(join(output, 'system-prompt.expected.md'), prompt)
    await writeFile(join(output, 'tool-schemas.expected.json'), schemas)
    entry.writerSha256 = sdkOracleSha256(writer)
    entry.promptSha256 = sdkOracleSha256(prompt)
    entry.schemasSha256 = sdkOracleSha256(schemas)
  }
  await writeFile(join(root, 'oracle', 'registry.json'), `${JSON.stringify({
    version: 1,
    scenarios: { 'academic-plan-chinese': entry },
  })}\n`)
  return { root: join(root, 'oracle'), scenario, writer }
}

it('pins the real SDK-01 V4 input while its independent writer expectation is pending', async () => {
  const oracle = await readSdkOracle(oracleRoot, scenarioDir)
  expect(oracle).toMatchObject({ status: 'pending', source: 'session.v4.jsonl' })
  const source = await readFile(join(scenarioDir, oracle.source), 'utf8')
  expect(sdkOracleSha256(source)).toBe(oracle.sourceSha256)
})

it('reads only an exact active native output inventory with matching digests', async () => {
  const fixture = await temporaryFixture('active')
  const oracle = await readSdkOracle(fixture.root, fixture.scenario)
  expect(oracle.status).toBe('active')
  if (oracle.status !== 'active') throw new Error('expected active oracle')
  expect(oracle.writer).toBe(fixture.writer)
  expect((await readdir(join(fixture.root, 'academic-plan-chinese'))).sort()).toEqual([
    'system-prompt.expected.md', 'tool-schemas.expected.json', 'writer.expected.jsonl',
  ])
})

it('rejects a changed replay input and an active oracle with missing output', async () => {
  const pending = await temporaryFixture('pending')
  await writeFile(join(pending.scenario, 'session.v4.jsonl'), `${pending.writer}\n`)
  await expect(readSdkOracle(pending.root, pending.scenario)).rejects.toThrow('replay input digest changed')

  const active = await temporaryFixture('active')
  await rm(join(active.root, 'academic-plan-chinese', 'writer.expected.jsonl'))
  await expect(readSdkOracle(active.root, active.scenario)).rejects.toThrow('output inventory differs')
})

it('rejects an active oracle with extra output or a changed writer digest', async () => {
  const extra = await temporaryFixture('active')
  await writeFile(join(extra.root, 'academic-plan-chinese', 'unexpected.jsonl'), '{}\n')
  await expect(readSdkOracle(extra.root, extra.scenario)).rejects.toThrow('output inventory differs')

  const changed = await temporaryFixture('active')
  await writeFile(join(changed.root, 'academic-plan-chinese', 'writer.expected.jsonl'), `${changed.writer}\n`)
  await expect(readSdkOracle(changed.root, changed.scenario)).rejects.toThrow('output digest changed')
})

it('does not accept a replay fixture copied into the writer role', async () => {
  const fixture = await temporaryFixture('active')
  const source = await readFile(join(fixture.scenario, 'session.v4.jsonl'), 'utf8')
  await writeFile(join(fixture.root, 'academic-plan-chinese', 'writer.expected.jsonl'), source)
  const registryPath = join(fixture.root, 'registry.json')
  const registry = await readFile(registryPath, 'utf8')
  await writeFile(registryPath, registry.replace(sdkOracleSha256(fixture.writer), sdkOracleSha256(source)))
  await expect(readSdkOracle(fixture.root, fixture.scenario)).rejects.toThrow('cannot copy replay input')
})

it('rejects record and refresh for registered frozen SDK scenarios', () => {
  expect(() => { assertSdkOracleReplayMode('replay') }).not.toThrow()
  expect(() => { assertSdkOracleReplayMode('record') }).toThrow('cannot write frozen fixtures')
  expect(() => { assertSdkOracleReplayMode('refresh') }).toThrow('cannot write frozen fixtures')
})

it('captures exact native JSONL only in an empty directory outside Git checkouts', async () => {
  const oracle = await readSdkOracle(oracleRoot, scenarioDir)
  const evidence = await mkdtemp(join(tmpdir(), 'dsh-sdk-oracle-evidence-'))
  onTestFinished(() => rm(evidence, { recursive: true, force: true }))
  const raw = await readFile(join(scenarioDir, 'session.v4.jsonl'), 'utf8')
  await captureSdkOracleEvidence(repositoryRoot, evidence, oracle, [{ content: raw }])
  expect(await readFile(join(evidence, 'writer.raw.jsonl'), 'utf8')).toBe(raw)
  expect(JSON.parse(await readFile(join(evidence, 'capture.json'), 'utf8'))).toMatchObject({
    scenario: 'academic-plan-chinese',
    sourceSha256: oracle.sourceSha256,
    writerSha256: sdkOracleSha256(raw),
  })
  await expect(captureSdkOracleEvidence(repositoryRoot, evidence, oracle, [{ content: raw }]))
    .rejects.toThrow('must be empty')
  await expect(captureSdkOracleEvidence(repositoryRoot, repositoryRoot, oracle, [{ content: raw }]))
    .rejects.toThrow('outside the checkout')
})

it('rejects capture into another Git checkout and before a native Session exists', async () => {
  const oracle = await readSdkOracle(oracleRoot, scenarioDir)
  const root = await mkdtemp(join(tmpdir(), 'dsh-sdk-oracle-git-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, '.git'))
  const evidence = join(root, 'evidence')
  await mkdir(evidence)
  const raw = await readFile(join(scenarioDir, 'session.v4.jsonl'), 'utf8')
  await expect(captureSdkOracleEvidence(repositoryRoot, evidence, oracle, [{ content: raw }]))
    .rejects.toThrow('cannot be in a Git checkout')
  const outside = await mkdtemp(join(tmpdir(), 'dsh-sdk-oracle-empty-'))
  onTestFinished(() => rm(outside, { recursive: true, force: true }))
  await expect(captureSdkOracleEvidence(repositoryRoot, outside, oracle, []))
    .rejects.toThrow('exactly one persisted Session')
})
