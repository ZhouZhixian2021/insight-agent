/** File-only SDK comparison checks against the real pure session normalizer. */

import { describe, expect, it } from 'vitest'
import { normalizeSessionLog, type NormalizeContext } from '../src/normalize.ts'
import { withSdkJsonCwdAlias } from '../src/sdk-comparison-context.ts'

const cwd = 'C:\\Temp\\sdk-case'
const base: NormalizeContext = { sessionIds: ['session-a'], cwd }
const quotedContext = (directory: string) => `Current working directory: ${JSON.stringify(directory)}.`
const jsonl = (rows: readonly unknown[]) => rows.map(row => JSON.stringify(row)).join('\n') + '\n'

function normalizedText(text: string, context: NormalizeContext): string {
  return normalizeSessionLog(jsonl([{ type: 'tool/result', seq: 7, time: 0, data: { text } }]), context, { identityMode: 'preserve' })
}

function expectedText(text: string): string {
  return jsonl([{ type: 'tool/result', seq: 7, time: 0, data: { text } }])
}

describe('SDK JSON-cwd comparison context', () => {
  it('preserves the original context and existing aliases', () => {
    const context: NormalizeContext = { ...base, cwdAliases: ['C:\\TEMP~1\\sdk-case'] }
    Object.freeze(context.cwdAliases)
    Object.freeze(context)
    const result = withSdkJsonCwdAlias(context)
    expect(context).toEqual({ ...base, cwdAliases: ['C:\\TEMP~1\\sdk-case'] })
    expect(result.sessionIds).toBe(context.sessionIds)
    expect(result.cwd).toBe(cwd)
    expect(result.cwdAliases).toEqual(['C:\\TEMP~1\\sdk-case', 'C:\\\\Temp\\\\sdk-case'])
    expect(result).not.toBe(context)
  })

  it('does not add an alias already present', () => {
    const context: NormalizeContext = { ...base, cwdAliases: ['C:\\\\Temp\\\\sdk-case'] }
    expect(withSdkJsonCwdAlias(context)).toBe(context)
    const once = withSdkJsonCwdAlias(base)
    expect(withSdkJsonCwdAlias(once)).toBe(once)
  })

  it.each(['/tmp/sdk-case', 'C:/Temp/sdk-case', ''])('keeps an unchanged JSON spelling for %j', (directory) => {
    const context: NormalizeContext = { sessionIds: [], cwd: directory }
    expect(withSdkJsonCwdAlias(context)).toBe(context)
  })

  it('leaves the shared normalizer behavior unchanged without the alias', () => {
    const text = quotedContext(cwd)
    expect(normalizedText(text, base)).toBe(expectedText(text))
    expect(normalizedText(text, withSdkJsonCwdAlias(base)))
      .toBe(expectedText('Current working directory: "{{cwd}}".'))
  })

  it('normalizes direct cwd and both runtime-context fields while preserving the event', () => {
    const text = quotedContext(cwd)
    const header = { type: 'session', version: 4, id: 'session-a', createdAt: 0, cwd }
    const contextPrefix = 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n'
    const data = {
      id: 'message-a',
      role: 'user',
      content: [{ type: 'text', text: contextPrefix + text }],
      source: { kind: 'runtime-context', form: 'snapshot', sections: [{ name: 'working-directory:current', text }] },
    }
    const event = { type: 'user/message', seq: 8, time: 0, surfaceOp: 'append', sourceEventSeqs: [2, 7], data }
    const stableText = 'Current working directory: "{{cwd}}".'
    const expected = jsonl([
      { ...header, cwd: '{{cwd}}' },
      { ...event, data: { ...data,
        content: [{ type: 'text', text: contextPrefix + stableText }],
        source: { ...data.source, sections: [{ name: 'working-directory:current', text: stableText }] },
      } },
    ])
    const context = withSdkJsonCwdAlias(base)
    const normalized = normalizeSessionLog(jsonl([header, event]), context, { identityMode: 'preserve' })
    expect(normalized).toBe(expected)
    expect(normalizeSessionLog(normalized, context, { identityMode: 'preserve' })).toBe(normalized)
  })

  it.each([
    ['similar dotted name', `${cwd}.backup`],
    ['similar dashed name', `${cwd}-backup`],
    ['longer segment', `${cwd}more`],
    ['different drive case', 'c:\\Temp\\sdk-case'],
    ['different separator spelling', 'C:/Temp/sdk-case'],
    ['other directory', 'C:\\Temp\\another-case'],
  ])('keeps %s visible', (_name, directory) => {
    const text = quotedContext(directory)
    expect(normalizedText(text, withSdkJsonCwdAlias(base))).toBe(expectedText(text))
  })

  it('recognizes the known UNC root without inventing other roots', () => {
    const context: NormalizeContext = { sessionIds: [], cwd: '\\\\server\\share\\sdk-case' }
    expect(normalizedText(quotedContext(context.cwd), withSdkJsonCwdAlias(context)))
      .toBe(expectedText('Current working directory: "{{cwd}}".'))
    const other = quotedContext('\\\\server\\other\\sdk-case')
    expect(normalizedText(other, withSdkJsonCwdAlias(context))).toBe(expectedText(other))
  })

  it('retains the encoded child separator difference', () => {
    const context = withSdkJsonCwdAlias(base)
    expect(normalizedText(quotedContext(`${cwd}\\child`), context))
      .toBe(expectedText('Current working directory: "{{cwd}}//child".'))
    expect(normalizedText(`${cwd}\\child`, context)).toBe(expectedText('{{cwd}}/child'))
  })

  it('does not treat another JSON encoding layer as the known alias', () => {
    const text = JSON.stringify(JSON.stringify(cwd))
    expect(normalizedText(text, withSdkJsonCwdAlias(base))).toBe(expectedText(text))
  })

  it('uses an existing longer alias before the shorter cwd', () => {
    const longer = `${cwd}\\nested`
    const context = withSdkJsonCwdAlias({ ...base, cwdAliases: [longer, longer] })
    expect(normalizedText(longer, context)).toBe(expectedText('{{cwd}}'))
    expect(context.cwdAliases?.slice(0, 2)).toEqual([longer, longer])
  })

  it('preserves unrelated commands, regular expressions, and authored text', () => {
    const text = String.raw`run C:\Other\file --pattern /a\\b/; literal C:\Temp\sdk-case-backup and {{cwd}}`
    expect(normalizedText(text, withSdkJsonCwdAlias(base))).toBe(expectedText(text))
  })
})
