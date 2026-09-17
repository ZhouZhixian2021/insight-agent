/** Sidebar entry for the fixed-data research result viewer. */
import { useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { RunPanel } from './RunPanel.tsx'
import { scenarios, scenarioView, type Scenario } from './run-scenarios.ts'
import css from './RunPanel.module.css'

/** Slot-derived shares; no alternate Session state or Remote transport. */
export type ResearchEntryProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'academicRun'>

/**
 * Open an explicitly synthetic viewer and switch deterministic test scenarios.
 * @param props Sidebar owner and locale shares supplied by the slot renderer.
 * @returns A sidebar trigger and the local sample dialog.
 */
export function ResearchEntry({ t }: ResearchEntryProps) {
  const [open, setOpen] = useState(false)
  const [scenario, setScenario] = useState<Scenario>('partial_success')
  return <>
    <button className={css.entry} type="button" title={t('entry')} onClick={() => { setOpen(true) }}>{t('entry')}</button>
    <Modal open={open} onClose={() => { setOpen(false) }} title={t('title')} closeLabel={t('close')}
      description={t('disclosure')} className={css.dialog} contentClassName={css.body}>
      <div className={css.controls}><label>{t('scenario')}
        <select value={scenario} onChange={(event) => { setScenario(event.target.value as Scenario) }}>
          {scenarios.map(choice => <option key={choice} value={choice}>{t(choice)}</option>)}
        </select>
      </label></div>
      <RunPanel key={scenario} view={scenarioView(scenario)} t={t} onCancel={() => { setScenario('cancelled') }} />
    </Modal>
  </>
}
