/** Deterministic presentation scenarios, with no network requests or simulated progress timer. */
import { sampleRun } from './run-sample.ts'
import type { RunView } from './run-types.ts'

/** Scenario choices are local demonstration controls, not Remote lifecycle states. */
export const scenarios = ['running', 'partial_success', 'success', 'cancelled', 'failed', 'blocked', 'error'] as const
/** One fixed demonstration choice. */
export type Scenario = typeof scenarios[number]

/**
 * Derive a clearly synthetic display case from A's fixed result.
 * @param scenario Local preview choice.
 * @returns An isolated view; changing this data never modifies the handoff fixture.
 */
export function scenarioView(scenario: Scenario): RunView {
  if (scenario === 'running') return { phase: 'running' }
  if (scenario === 'error') return { phase: 'error', message: 'Synthetic Remote request failure.' }
  const value = sampleRun()
  if (scenario === 'cancelled') return { phase: 'settled', value: {
    ...value, status: 'cancelled', report: null,
    retrievalRun: { ...value.retrievalRun, stage: 'cancelled', status: 'partial_success', completedAt: '2026-09-17T02:03:00.000Z' },
  } }
  if (scenario === 'failed') return { phase: 'settled', value: {
    ...value, papers: [], report: null,
    retrievalRun: { ...value.retrievalRun, stage: 'failed', status: 'failed', completedAt: '2026-09-17T02:03:00.000Z',
      academicWorkIds: [], coverageSummary: { ...value.retrievalRun.coverageSummary,
        discoveredRecords: 0, deduplicatedWorks: 0, includedWorks: 0, availableFulltextWorks: 0,
        truncated: false, limitations: ['Synthetic case: no works were included.'] },
    },
  } }
  if (scenario === 'success') return { phase: 'settled', value: { ...value,
    retrievalRun: { ...value.retrievalRun, stage: 'completed', status: 'success', completedAt: '2026-09-17T02:03:00.000Z',
      failures: [], coverageSummary: { ...value.retrievalRun.coverageSummary, failedOperations: 0,
        limitations: ['Synthetic successful retrieval; the aggregate result limit retained two of five discovered records.', 'Single search pass; no automatic retries.'],
      },
    },
    report: { ...value.report, limitations: ['Synthetic successful retrieval; semantic review is pending.'] },
  } }
  if (scenario === 'blocked') return { phase: 'settled', value: { ...value,
    report: { ...value.report, evaluation: { ...value.report.evaluation, status: 'blocked',
      issues: [{ claimId: null, code: 'synthetic_block', message: 'Synthetic case: delivery requirements are not satisfied.' }],
    } },
  } }
  return { phase: 'settled', value }
}
