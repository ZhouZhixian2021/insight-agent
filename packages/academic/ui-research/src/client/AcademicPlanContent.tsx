import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import { Button, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AcademicPlanPresentation } from './plan-review.ts'
import css from './AcademicPlanContent.module.css'

/** Slot-derived plan content; decision settlement remains with the shared approval owner. */
export type AcademicPlanContentProps = PropsRuntime<'conversation.plan-review.content'>
  & PropsLocale<'academicPlan'> & { matched: AcademicPlanPresentation }

/**
 * Render the readable plan, expandable execution details and revision editor.
 * @param props - Reviewed sections and owner-controlled approval state.
 * @returns The Academic plan presentation and feedback controls.
 */
export function AcademicPlanContent({ matched, busy, editing, setEditing, revise, t }: AcademicPlanContentProps) {
  const [revision, setRevision] = useState('')
  useEffect(() => () => { setEditing(false) }, [setEditing])
  const labels = { code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('markdown.footnotes') }
  return <>
    <MarkdownText text={matched.before} labels={labels} />
    <details>
      <summary>{t('plan.executionDetails')}</summary>
      <MarkdownText text={matched.execution} labels={labels} />
    </details>
    <MarkdownText text={matched.after} labels={labels} />
    <div className={css.revision}>
      <p className={css.hint}>{t('plan.reviewHint')}</p>
      {editing ? <>
        <label className={css.revisionLabel}>
          {t('plan.revisionLabel')}
          <textarea rows={2} value={revision} disabled={busy} placeholder={t('plan.revisionPlaceholder')}
            onChange={(event) => { setRevision(event.target.value) }} />
        </label>
        <div className={css.actions}>
          <Button variant="ghost" disabled={busy} onClick={() => { setEditing(false) }}>{t('plan.revisionBack')}</Button>
          <Button variant="outline" disabled={busy || revision.trim() === ''}
            onClick={() => { revise(revision.trim()) }}>{t('plan.revisionSend')}</Button>
        </div>
      </> : <Button variant="outline" disabled={busy} onClick={() => { setEditing(true) }}>{t('plan.revise')}</Button>}
    </div>
  </>
}
