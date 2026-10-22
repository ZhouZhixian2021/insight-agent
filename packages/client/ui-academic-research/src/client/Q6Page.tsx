/** Explicitly synthetic Q6 preview isolated from the real research request form. */
import { useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Q6Sample } from './q6-types.ts'
import { q6Sample } from './q6-sample.ts'
import { Q6Plan } from './Q6Plan.tsx'
import { Q6Candidates } from './Q6Candidates.tsx'
import { Q6Coverage } from './Q6Coverage.tsx'
import css from './RunPanel.module.css'
import { RunExperience } from './RunExperience.tsx'
import { runExperienceSample } from './run-experience-sample.ts'
import type { PreviewState } from './run-experience-types.ts'

/**
 * Open a named demo without a Session, Remote call or automatic scenario fallback.
 * @param props Framework-localized labels.
 * @returns Demo trigger and read-only modal.
 */
export function Q6DemoEntry({ t }: PropsLocale<'academicRun'>) {
  const [open, setOpen] = useState(false)
  const [lifecycle, setLifecycle] = useState(false)
  const [preview, setPreview] = useState<PreviewState>(() => ({ selected: runExperienceSample.runs[0]?.id ?? '',
    runs: structuredClone(runExperienceSample.runs).map(run => ({ ...run, connected: false })) }))
  const connection = (connected: boolean) => { setPreview(previous => ({ ...previous,
    runs: previous.runs.map(run => run.id === previous.selected ? { ...run, connected } : run) })) }
  return <>
    <button className={css.entry} type="button" onClick={() => { setOpen(true); if (lifecycle) connection(true) }}>{t('q6_entry')}</button>
    <Modal open={open} onClose={() => { connection(false); setOpen(false) }} title={t('q6_title')} closeLabel={t('close')}
      className={css.dialog} contentClassName={css.body}>
      {open && <>
        <button type="button" onClick={() => { connection(!lifecycle); setLifecycle(!lifecycle) }}>{t(lifecycle ? 'exp_back' : 'exp_open')}</button>
        {lifecycle ? <RunExperience state={preview} onChange={setPreview} t={t} /> : <Q6Page data={q6Sample} t={t} />}
      </>}
    </Modal>
  </>
}

/**
 * Compose read-only shared Q1 data into inspectable Q6 sections.
 * @param props Explicit synthetic dataset and localized copy.
 * @returns Plan, authoritative candidate queues and separately recorded coverage.
 */
export function Q6Page({ data, t }: PropsLocale<'academicRun'> & { readonly data: Q6Sample }) {
  const [tab, setTab] = useState<'plan' | 'candidates' | 'coverage'>('plan')
  return <div className={css.page}>
    <p role="note" className={css.notice}>{t('q6_demoNotice')}</p>
    <nav aria-label={t('q6_title')} className={css.controls}>
      {(['plan', 'candidates', 'coverage'] as const).map(key => <button key={key} type="button"
        aria-pressed={tab === key} onClick={() => { setTab(key) }}>{t(`q6_${key}`)}</button>)}
    </nav>
    {tab === 'plan' && <Q6Plan plan={data.plan} t={t} />}
    {tab === 'candidates' && <Q6Candidates key={`${data.plan.researchBriefId}:${data.plan.researchBriefVersion}`} data={data} t={t} />}
    {tab === 'coverage' && <Q6Coverage key={`${data.plan.researchBriefId}:${data.plan.researchBriefVersion}`} data={data} t={t} />}
  </div>
}
