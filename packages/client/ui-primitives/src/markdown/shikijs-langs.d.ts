/** Shiki publishes grammar subpaths as JavaScript without per-subpath declarations. */
declare module '@shikijs/langs/*' {
  import type { LanguageRegistration } from 'shiki/core'

  const languages: LanguageRegistration[]
  export default languages
}
