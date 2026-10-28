/** Developer-only export/replay of recorded Academic research; never launches an agent or a model. */
import { parseArgs } from 'node:util'
import { exportExperiment } from './academic-experiment/export.ts'
import { prepareAnalysisExperiment, replayExperiment } from './academic-experiment/replay.ts'
import { compareWriting } from './academic-experiment/writing.ts'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  session: { type: 'string' }, run: { type: 'string' }, output: { type: 'string' }, html: { type: 'string' },
  bundle: { type: 'string' }, response: { type: 'string' }, compare: { type: 'string' },
  'variant-a': { type: 'string' }, 'variant-b': { type: 'string' },
} })
try {
  if (positionals.length !== 1 || values.output === undefined) throw new Error('Specify export|replay|prepare-analysis and --output <new-directory>.')
  let output: string
  if (positionals[0] === 'export') {
    if (values.session === undefined || values.run === undefined) throw new Error('export requires --session <file> and --run <researchRunId>.')
    output = exportExperiment({ sessionFile: values.session, runId: values.run, output: values.output,
      ...values.html === undefined ? {} : { htmlFile: values.html } })
  } else if (positionals[0] === 'replay') {
    if (values.bundle === undefined) throw new Error('replay requires --bundle <directory>.')
    output = replayExperiment({ bundle: values.bundle, output: values.output,
      ...values.response === undefined ? {} : { responseFile: values.response },
      ...values.compare === undefined ? {} : { comparison: values.compare } })
  } else if (positionals[0] === 'prepare-analysis') {
    if (values.bundle === undefined) throw new Error('prepare-analysis requires --bundle <directory>.')
    output = prepareAnalysisExperiment(values.bundle, values.output)
  } else if (positionals[0] === 'compare-writing') {
    if (values.bundle === undefined || values['variant-a'] === undefined || values['variant-b'] === undefined) {
      throw new Error('compare-writing requires --bundle, --variant-a and --variant-b.')
    }
    output = compareWriting(values.bundle, [values['variant-a'], values['variant-b']], values.output)
  } else throw new Error('Unknown command. Use export, replay, prepare-analysis or compare-writing.')
  console.log(`Academic experiment saved: ${output}`)
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
