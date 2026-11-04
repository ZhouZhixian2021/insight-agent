/** Business-owned preset display registrations, scoped to one Client plugin instance. */
import type { LocalizedText } from '@deepseek-ai/dsh-package-manifest'
import type { BuiltInPresetCopyKey, PresetDisplaySource, PresetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
import { isBuiltInPreset, presetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Localized text supplied by the preset's owning plugin. */
export interface PresetDisplayCopy {
  readonly name: LocalizedText
  readonly description: LocalizedText
}

/** Plain callbacks injected into the preset views. */
export interface PresetDisplayMethods {
  /** Resolve display text, respecting an explicitly named custom override. */
  displayPreset: (preset: PresetDisplaySource) => PresetDisplayText
  /** Whether the row uses deployment-owned display metadata. */
  isBuiltInPreset: (preset: PresetDisplaySource) => boolean
}

/** Registry of optional display contributions; no entries outlive their registrants. */
export class AgentPresetDisplayRegistry {
  private readonly entries = new Map<string, PresetDisplayCopy>()
  /** Revision observed by all preset views, including registration and unload. */
  readonly store: SnapshotStore<number> = createSnapshotStore(0)

  constructor(
    private readonly resolveText: (text: LocalizedText) => string,
    private readonly translate: (key: BuiltInPresetCopyKey) => string,
  ) {}

  /**
   * Register one preset's display copy.
   * @param id - Preset identity from the Host roster.
   * @param copy - Complete localized name and description.
   * @returns Disposer that withdraws only this registration.
   */
  register(id: string, copy: PresetDisplayCopy): () => void {
    if (this.entries.has(id)) throw new Error(`Preset display already registered: ${id}`)
    this.entries.set(id, copy)
    this.store.set(this.store.getSnapshot() + 1)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.entries.delete(id)
      this.store.set(this.store.getSnapshot() + 1)
    }
  }

  /**
   * Resolve a row at the active locale, with ordinary declaration text as fallback.
   * @param preset - Roster row or saved selection.
   * @returns The localized label and description.
   */
  display(preset: PresetDisplaySource): PresetDisplayText {
    const copy = preset.name === undefined ? this.entries.get(preset.id) : undefined
    return copy === undefined ? presetDisplayText(preset, this.translate)
      : { name: this.resolveText(copy.name), description: this.resolveText(copy.description) }
  }

  /**
   * Classify deployment-provided rows while respecting a named custom override.
   * @param preset - Roster row.
   * @returns Whether a registered business or the framework owns the label.
   */
  isBuiltIn(preset: PresetDisplaySource): boolean {
    return preset.name === undefined && (this.entries.has(preset.id) || isBuiltInPreset(preset))
  }
}
