/** Reader-facing grouping of producer notes; original records remain available for inspection. */
export interface ReportLimitationSummary {
  readonly keyLimitations: readonly string[]
  readonly questionGaps: readonly string[]
  readonly processingNotes: readonly string[]
  readonly diagnostics: readonly string[]
}

/**
 * Separate evidence gaps from processing facts without changing delivery decisions or adding batch counts.
 * @param messages Producer notes and content issues, including historical unstructured messages.
 * @param versionTitles Known version-to-paper titles; omitted identities remain unnamed.
 * @returns Deduplicated reading groups and every distinct original message in diagnostics.
 */
export function summarizeReportLimitations(messages: readonly string[],
  versionTitles: ReadonlyMap<string, string> = new Map()): ReportLimitationSummary {
  const keyLimitations = new Set<string>(), questionGaps = new Set<string>(), processingNotes = new Set<string>()
  const diagnostics = [...new Set(messages.filter(message => message.trim() !== ''))]
  const identity = /[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/giu
  const paperLabel = (id: string | undefined) => {
    const title = id === undefined ? undefined : versionTitles.get(id)
    return title === undefined ? '候选论文' : `《${title}》`
  }
  for (const raw of diagnostics) {
    const message = raw.trim()
    const excluded = /^Excluded version ([^:]+):\s*(.+)$/su.exec(message)
    const failed = /^Version (\S+) failed during (fulltext|extraction)\.$/u.exec(message)
    if (excluded !== null) {
      processingNotes.add(`${paperLabel(excluded[1])}因不符合纳入规则被排除：${excluded[2]}`)
    } else if (failed !== null) {
      processingNotes.add(`${paperLabel(failed[1])}${failed[2] === 'fulltext' ? '全文获取' : '证据抽取'}失败；具体记录见运行诊断。`)
      keyLimitations.add('部分论文处理失败，本次可用材料和覆盖受到限制。')
    } else if (/^Version .+: retained \d+ evidence records; rejected \d+ drafts during source verification\.$/u.test(message)) {
      processingNotes.add('部分抽取草稿未通过来源核验；保留的有效证据与被拒原因见运行记录。')
    } else if (message === 'The desired inclusion target and question coverage are satisfied.') {
      processingNotes.add('工作流因纳入目标及其覆盖停止条件满足而结束；不代表每个问题已被充分回答。')
    } else if (message === 'The approved included-work limit has been reached.') {
      processingNotes.add('已达到批准的论文纳入上限。')
    } else if (/truncat|aggregate result bound|候选选择器限制/u.test(message)) {
      keyLimitations.add('检索覆盖受限或提前截断，本次结果不能视为完整文献覆盖。')
    } else if (/^Provider \S+ failed during /u.test(message)) {
      keyLimitations.add('部分检索来源调用失败，本次来源覆盖不完整。')
    } else if (/^\d+ returned works have (unknown|no resolvable)/u.test(message)) {
      keyLimitations.add('部分候选缺少可靠元数据或可用全文入口；不表示相关论文或全文不存在。')
    } else if (/^unavailable_field:|^证据卡部分分区/u.test(message)) {
      keyLimitations.add('部分证据字段或证据卡分区尚未抽取，不能据此认定论文没有相应发现。')
    } else if (/^问题\s*\d+|[？?]：|^研究空白：/u.test(message)) {
      questionGaps.add(message.replace(/^研究空白：/u, '本轮证据缺口：').replace(identity, id => versionTitles.get(id) ?? '（内部标识见运行诊断）'))
    } else if (/^Explicit queries only;/u.test(message)
      || /^OpenAlex (keyword search|returns at most|aggregate publication)/u.test(message)
      || /^Full-text (locations|resolution)/u.test(message)
      || /^局限性：.*limitations/u.test(message)) {
      // Provider mechanics and layout bookkeeping are retained verbatim in diagnostics only.
    } else if (/[\p{Script=Han}]/u.test(message)) {
      keyLimitations.add(message.replace(identity, id => versionTitles.get(id) ?? '（内部标识见运行诊断）'))
    } else {
      keyLimitations.add('存在尚未归类的运行说明，详见原始诊断；不能据此认定没有其他限制。')
    }
  }
  return { keyLimitations: [...keyLimitations], questionGaps: [...questionGaps], processingNotes: [...processingNotes], diagnostics }
}
