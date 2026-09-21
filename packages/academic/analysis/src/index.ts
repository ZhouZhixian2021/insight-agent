/** Academic analysis public exports. */
export type { AnalysisInput, AnalysisSection, PreparationIssue, PreparationIssueCode, PreparedAnalysisInput, PreparedVersion, PreparedWork } from './types.ts'
export { analyzeEvidence } from './analyze.ts'
export type { AnalysisResult } from './analyze.ts'
export { prepareSynthesisInput, synthesisSections, validateSynthesisRequirements } from './synthesis-input.ts'
export { parseSynthesisDraft } from './synthesis-parse.ts'
export { synthesisPrompt, synthesisAnalysis } from './synthesis.ts'
export { SYNTHESIS_SECTIONS, SynthesisError } from './synthesis-types.ts'
export type { AcademicSynthesisInput, AcademicSynthesisDraft, SynthesisStatement, SynthesisQuestionAnswer, SynthesisSectionId, RejectedSynthesisStatement } from './synthesis-types.ts'
export type { SynthesisAdmission } from './synthesis-input.ts'

export { prepareAnalysisInput } from './prepare.ts'
