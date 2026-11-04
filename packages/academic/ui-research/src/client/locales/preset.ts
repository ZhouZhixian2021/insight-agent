import type { PresetDisplayCopy } from '@deepseek-ai/dsh-client-ui-agent-preset/client'

/** Academic mode dictionary, shared by the picker, header and settings roster. */
export const academicPresetCopy = {
  name: { en: 'Academic insight', zh: '学术洞察' },
  description: {
    en: 'Research agent for technical frontiers that finds and verifies papers, then produces an evidence-traceable structured report.',
    zh: '面向技术前沿研究的学术 Agent，检索并核验论文证据，形成可追溯的结构化洞察报告。',
  },
} satisfies PresetDisplayCopy
