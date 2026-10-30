import { describe, expect, it } from 'vitest'
import { createRetrievalRunId } from '@deepseek-ai/dsh-academic-model'
import { parseQuestionCoverage, type QuestionCoverageInput } from '../src/coverage-model.ts'
import { runResearchDraft } from '../src/pipeline.ts'
import { draftFixture } from './pipeline-fixture.ts'

async function fixture(): Promise<QuestionCoverageInput> {
  const f = draftFixture()
  const result = await runResearchDraft(f.input, f.adapters)
  const evidence = result.papers.flatMap(paper => paper.status === 'extracted' ? paper.evidence.evidenceRecords : [])
  return { retrievalRunId: createRetrievalRunId(), minimumSupportingWorks: 1, evidence,
    coverage: { schemaVersion: 1, researchBriefId: f.input.brief.researchBriefId, researchBriefVersion: 1,
      assessedAt: f.adapters.now(), evidenceRequirementsMet: true, allQuestionsCovered: false,
      questions: [{ question: 'Compare scheduling, memory management and I/O.', status: 'partial',
        supportingWorkIds: evidence.map(record => record.academicWorkId), evidenceIds: evidence.map(record => record.evidenceId),
        gaps: ['Answer completeness is unassessed.'] }] } }
}

describe('question answer completeness', () => {
  it('retains missing aspects despite multiple related source-verified records', async () => {
    const input = await fixture()
    const result = parseQuestionCoverage(JSON.stringify({ questions: [{ questionIndex: 0,
      fullyAnswered: false, evidenceIndexes: [0, 1], missingAspects: ['Scheduling and memory-management results are missing.'] }] }), input)
    expect(result.allQuestionsCovered).toBe(false)
    expect(result.questions[0]).toMatchObject({ status: 'partial',
      gaps: ['Scheduling and memory-management results are missing.'] })
  })

  it('enforces independent-work counts even when the model proposes a complete answer', async () => {
    const input = { ...await fixture(), minimumSupportingWorks: 2 }
    const result = parseQuestionCoverage(JSON.stringify({ questions: [{ questionIndex: 0,
      fullyAnswered: true, evidenceIndexes: [0], missingAspects: [] }] }), input)
    expect(result.questions[0]?.status).toBe('partial')
    expect(result.allQuestionsCovered).toBe(false)
  })

  it('rejects evidence that is not linked to the assessed question', async () => {
    const input = await fixture()
    const unlinked = { ...input, coverage: { ...input.coverage, questions: input.coverage.questions.map(question =>
      ({ ...question, evidenceIds: [] })) } }
    expect(() => parseQuestionCoverage(JSON.stringify({ questions: [{ questionIndex: 0,
      fullyAnswered: true, evidenceIndexes: [0], missingAspects: [] }] }), unlinked))
      .toThrow('Question coverage response is invalid.')
  })
})
