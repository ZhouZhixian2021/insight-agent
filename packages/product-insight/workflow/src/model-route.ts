import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'

export interface ProductModelRoute { readonly provider: string; readonly model: string }

/** Keep the selected model until repeated transient failures justify a configured backup. */
export class ProductModelRouteSelector {
  private current: LlmCallConfig
  private failures = 0
  private next = 0

  constructor(primary: LlmCallConfig, private readonly backups: readonly ProductModelRoute[]) {
    this.current = primary
  }

  get route(): LlmCallConfig { return this.current }

  succeeded(): void { this.failures = 0 }

  async failed(validate: (route: LlmCallConfig) => Promise<void>): Promise<
    { from: ProductModelRoute; to: ProductModelRoute } | undefined> {
    if (++this.failures < 3) return undefined
    this.failures = 0
    while (this.next < this.backups.length) {
      const backup = this.backups[this.next++]
      if (backup === undefined) break
      if (backup.provider === this.current.provider && backup.model === this.current.model) continue
      const candidate = { ...this.current, provider: backup.provider, model: backup.model }
      try { await validate(candidate) }
      catch { continue }
      const from = { provider: this.current.provider, model: this.current.model }
      this.current = candidate
      return { from, to: backup }
    }
    return undefined
  }
}
