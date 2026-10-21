import { useMemo, useState } from 'react'
import {
  Button, MarkdownText, extractMarkdownPlainText, IconEditOutlineRegular, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PendingQuestion, PlanReview, QuestionComposerProps } from './contract/slots.ts'
import css from './PlanReviewPanel.module.css'

/** The panel's own props: the question domain face, the narrowed review, and the locale seat. */
export type PlanReviewPanelProps =
  { pending: PendingQuestion; review: PlanReview } & Pick<QuestionComposerProps, 't' | 'renderSlot'>

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
 * Render plan review controls; the submitted document opens in the sidebar.
 *
 * @param props - the question domain face, the narrowed plan review, and `t`.
 * @returns The plan-review takeover for this request.
 */
export function PlanReviewPanel({ pending, review, t, renderSlot }: PlanReviewPanelProps) {
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
  const settle = (send: () => Promise<void>, remote = false): void => {
    setBusy(true)
    setError(null)
    void send()
      .then(() => {
        if (!remote) return
        setBusy(false)
        void pending.dismiss().catch(() => { setError(t('status.sent')) })
      })
      .catch((cause: unknown) => {
        setBusy(false)
        setError(cause instanceof Error ? cause.message : String(cause))
      })
  }
  const decide = (label: string): void => {
    settle(() => pending.answer({ answers: [{ id: review.id, selected: [label] }] }), pending.snapshot().channel === 'rpc')
  }
  const summary = useMemo(() => {
    const title = extractMarkdownPlainText(review.plan, { mode: 'first-line' })
    const description = extractMarkdownPlainText(review.plan, { mode: 'first-paragraph' })
    return { title, description: description === title ? '' : description }
  }, [review.plan])

  return (
    <div className={css.frame} data-plan-review-key={pending.key}>
      <section className={css.card} aria-label={review.question} aria-busy={busy}>
        <div className={css.strip}>
          <StateDot state={busy ? 'ongoing' : 'warning'} />
          {t('plan.header')}
          <div className={css.previewActions}>
            {renderSlot('conversation.plan-review.actions', { review, requestKey: pending.key })}
          </div>
        </div>
        <div className={css.body} data-plan-review-scroll>
          {handoff === undefined ? <>
            <h3 className={css.title}>{summary.title}</h3>
            {summary.description !== '' && <p className={css.description}>{summary.description}</p>}
          </> : <>
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
                settle(() => pending.answer({ answers: [{ id: review.id, selected: [], custom: revision.trim() }] }), pending.snapshot().channel === 'rpc')
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
              variant="outline" className={css.discuss} icon={<IconEditOutlineRegular size={14} />}
              disabled={busy} onClick={() => { settle(() => pending.dismiss()) }}
            >
              {t('plan.discuss')}
            </Button>
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
