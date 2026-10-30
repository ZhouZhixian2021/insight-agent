/** Read producer-owned Markdown groups without importing server execution into the browser. */
import type { AcademicResearchRunValue } from '@deepseek-ai/dsh-api-academic-research-controller/types'
import type { ReportLimitationSummary } from '@deepseek-ai/dsh-academic-report'

type Report = NonNullable<AcademicResearchRunValue['report']>

/**
 * Recognize all required headings of the current producer format.
 * @param report Formal Remote report with producer-owned Markdown.
 * @returns Whether every required limitation section is present.
 */
export function hasLimitationGroups(report: Report): boolean {
  return ['逐题内容缺口', '筛选与处理记录', '运行诊断（原始记录）'].every(title =>
    report.markdown.split(/\r?\n/u).includes(`## ${title}`))
}

/**
 * Read already classified producer lines; legacy reports retain raw notes with an explicit notice.
 * @param report Formal Remote report, with its original content issues.
 * @returns Presentation groups without reclassifying messages or changing evaluation.
 */
export function reportLimitations(report: Report): ReportLimitationSummary {
  const diagnostics = [...new Set([...report.limitations,
    ...report.evaluation.issues.filter(issue => issue.category === 'content').map(issue => issue.message)])]
  if (!hasLimitationGroups(report)) return { keyLimitations: [], questionGaps: [], processingNotes: [], diagnostics }
  const groups = new Map<string, string[]>()
  let section: string | undefined
  for (const line of report.markdown.split(/\r?\n/u)) {
    if (line.startsWith('## ')) {
      section = line.slice(3)
      groups.set(section, [])
    } else if (section !== undefined && line.startsWith('- ')) {
      groups.get(section)?.push(line.slice(2).replace(/\\([\\`*_{}\[\]<>#|])/gu, '$1'))
    }
  }
  return { keyLimitations: groups.get('关键限制') ?? [], questionGaps: groups.get('逐题内容缺口') ?? [],
    processingNotes: groups.get('筛选与处理记录') ?? [], diagnostics }
}
