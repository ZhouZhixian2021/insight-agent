/** Escape untrusted text for report Markdown. */
/**
 * Escape model and provider prose before embedding it in generated Markdown.
 * @param text Untrusted plain text.
 * @returns One escaped Markdown line without active markup.
 */
export function escapeMarkdown(text: string): string {
  return text.replaceAll('\\', '\\\\').replace(/([`*_{}\[\]<>#|])/gu, '\\$1').replace(/\r?\n/gu, ' ')
}
