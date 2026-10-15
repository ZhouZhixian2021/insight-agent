import { useMemo, useState } from 'react'
import { Button, IconEditOutline16, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PendingQuestion, PlanReview, QuestionComposerProps } from './contract/slots.ts'
import css from './PlanReviewPanel.module.css'

/** The panel's own props: the question domain face, the narrowed review, and the locale seat. */
export type PlanReviewPanelProps =
  { pending: PendingQuestion; review: PlanReview } & Pick<QuestionComposerProps, 't'>

/**
 * Optional-prop spread for a decision button's tooltip: `title` is optional on
 * the DOM props, and exactOptionalPropertyTypes rejects an explicit undefined.
 *
 * @param description - the asker's option description, when it carries one.
 * @returns The `title` prop to spread, or nothing.
 */
function tooltip(description: string | undefined): { title?: string } {
  return description === undefined ? {} : { title: description }
}

/**
 * Render a plan review as a decision card.
 *
 * @param props - the question domain face, the narrowed plan review, and `t`.
 * @returns The plan-review takeover for this request.
 */
export function PlanReviewPanel({ pending, review, t }: PlanReviewPanelProps) {
  // Only the named machine handoff is folded; approval still refers to the
  // original pending request. Ambiguous plans remain fully visible.
  const handoff = useMemo(() => {
    const matches = [...review.plan.matchAll(/(?:^|\n)```academic-research-brief-json\s*\n[\s\S]*?\n```(?=\n|$)/gu)]
    return matches.length === 1 ? matches[0] : undefined
  }, [review.plan])
  const markdownLabels = useMemo(() => ({
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  }), [t])
  // The panel waits for the host's resolved frame before leaving, so repeated
  // clicks must not resubmit. A failed send re-enables it and shows the error.
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [revision, setRevision] = useState('')
  const readable = (text: string): string => {
    const labels = ['研究目标', '核心问题', '研究范围', '执行方式', '交付结果', '待确认事项']
    return labels.every(label => text.includes(`${label}：`))
      ? text.replace(/(核心问题|研究范围|执行方式|交付结果|待确认事项)：/gu, '\n\n$1：') : text
  }
  const settle = (send: () => Promise<void>): void => {
    setBusy(true)
    setError(null)
    void send().catch((cause: unknown) => {
      setBusy(false)
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }
  const decide = (label: string): void => {
    settle(() => pending.answer({ answers: [{ id: review.id, selected: [label] }] }))
  }
  const decline = review.decline

  return (
    <div className={css.frame} data-plan-review-key={pending.key}>
      <section className={css.card} aria-label={review.question}>
        <div className={css.strip}>
          <span className={css.dot} />
          {t('plan.header')}
        </div>
        <div className={css.body} data-plan-review-scroll>
          {handoff === undefined ? <MarkdownText text={review.plan} labels={markdownLabels} /> : <>
            <MarkdownText text={readable(review.plan.slice(0, handoff.index))} labels={markdownLabels} />
            <details>
              <summary>{t('plan.executionDetails')}</summary>
              <MarkdownText text={handoff[0]} labels={markdownLabels} />
            </details>
            <MarkdownText text={review.plan.slice(handoff.index + handoff[0].length)} labels={markdownLabels} />
          </>}
        </div>
        {handoff !== undefined && <div className={css.revision}>
          <p className={css.hint}>{t('plan.reviewHint')}</p>
          {editing ? <>
            <label className={css.revisionLabel}>
              {t('plan.revisionLabel')}
              <textarea rows={2} value={revision} disabled={busy}
                placeholder={t('plan.revisionPlaceholder')}
                onChange={(event) => { setRevision(event.target.value) }} />
            </label>
            <div className={css.actions}>
              <Button variant="ghost" disabled={busy} onClick={() => { setEditing(false) }}>
                {t('plan.revisionBack')}
              </Button>
              <Button variant="outline" disabled={busy || revision.trim() === ''} onClick={() => {
                settle(() => pending.answer({ answers: [{ id: review.id, selected: [], custom: revision.trim() }] }))
              }}>{t('plan.revisionSend')}</Button>
            </div>
          </> : <Button variant="outline" disabled={busy} onClick={() => { setEditing(true) }}>
            {t('plan.revise')}
          </Button>}
        </div>}
        <div className={css.footer}>
          <div className={css.feedback} role="status">{error}</div>
          <div className={css.actions}>
            <Button
              variant="ghost" className={css.discuss} icon={<IconEditOutline16 size={14} />}
              disabled={busy} onClick={() => { settle(() => pending.cancel()) }}
            >
              {t('plan.discuss')}
            </Button>
            {decline !== undefined && (
              <Button
                variant="outline" {...tooltip(decline.description)}
                disabled={busy} onClick={() => { decide(decline.label) }}
              >
                {t('plan.decline')}
              </Button>
            )}
            <Button
              variant="primary" {...tooltip(review.approve.description)}
              disabled={busy || editing} onClick={() => { decide(review.approve.label) }}
            >
              {t('plan.approve')}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
