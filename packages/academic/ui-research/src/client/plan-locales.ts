/** Academic plan-review dictionary keys. */
export const zh = {
  'plan.reviewHint': '请核对研究问题、范围、证据要求及不足时的处理；提交修改后需重新审批。',
  'plan.revisionLabel': '修改研究计划',
  'plan.revisionPlaceholder': '例如：时间改为近三年，不纳入预印本。',
  'plan.revisionBack': '返回审批',
  'plan.revisionSend': '提交修改，重新规划',
  'plan.revise': '修改计划',
  'plan.executionDetails': '系统执行信息（自动生成，无需填写）',
} as const

/** Keys shared by the two Academic approval dictionaries. */
export type AcademicPlanKey = keyof typeof zh

/** English Academic approval dictionary. */
export const en: Record<AcademicPlanKey, string> = {
  'plan.reviewHint': 'Check the questions, scope, evidence requirements and shortage policy. Revisions require approval again.',
  'plan.revisionLabel': 'Revise the research plan',
  'plan.revisionPlaceholder': 'For example: use the last three years and exclude preprints.',
  'plan.revisionBack': 'Back to review',
  'plan.revisionSend': 'Request a revised plan',
  'plan.revise': 'Revise plan',
  'plan.executionDetails': 'System execution details (generated automatically)',
}
