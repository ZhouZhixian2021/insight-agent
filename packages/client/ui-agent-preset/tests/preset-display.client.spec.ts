import { describe, expect, it, vi } from 'vitest'
import { AgentPresetDisplayRegistry } from '../src/client/preset-display.ts'

describe('business preset display', () => {
  it('resolves the active language, preserves custom overrides and withdraws disposed copy', () => {
    let language: 'en' | 'zh' = 'zh'
    const registry = new AgentPresetDisplayRegistry(
      text => typeof text === 'string' ? text : text[language] ?? text.en,
      key => key,
    )
    const changed = vi.fn()
    const stop = registry.store.subscribe(changed)
    const copy = {
      name: { en: 'Research', zh: '研究' }, description: { en: 'Read evidence', zh: '阅读证据' },
    }
    const dispose = registry.register('research', copy)
    expect(registry.display({ id: 'research' })).toEqual({ name: '研究', description: '阅读证据' })
    language = 'en'
    expect(registry.display({ id: 'research' }).name).toBe('Research')
    expect(registry.isBuiltIn({ id: 'research' })).toBe(true)
    expect(registry.display({ id: 'research', name: 'My mode', description: 'My instructions' }))
      .toEqual({ name: 'My mode', description: 'My instructions' })
    expect(registry.isBuiltIn({ id: 'research', name: 'My mode' })).toBe(false)
    dispose()
    dispose()
    expect(registry.display({ id: 'research' })).toEqual({ name: 'research' })
    expect(registry.isBuiltIn({ id: 'research' })).toBe(false)
    expect(changed).toHaveBeenCalledTimes(2)
    const disposeNew = registry.register('research', copy)
    dispose()
    expect(registry.display({ id: 'research' }).name).toBe('Research')
    disposeNew()
    stop()
  })
})
