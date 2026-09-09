# 负责人 C：分析与产品

## 角色定位

负责人 C 负责把论文证据转化为可审核的分析结论、学术洞察报告、质量评测和专用 Web 使用体验。

## 拟议负责目录

- `packages/academic/analysis/`
- `packages/academic/report/`
- `packages/academic/eval/`
- `packages/client/ui-academic-research/`

## 主要交付

- 技术分类、论文对比、时间趋势、证据冲突和研究空白分析。
- 报告章节、引用呈现、证据到结论的关联和导出能力。
- 基准课题、评分量表、回归样例和报告质量验收。
- Research Brief 审核、执行进度、证据检查和报告查看界面。

## 协作边界

- 工作流接入和发布组合由 A 审核。
- 引用、来源和证据使用必须邀请 B 审核。
- 不直接修改来源 Provider；缺少字段时向 B 提交接口需求。
- 专用页面只消费已确认的工作流状态和业务接口，不复制后端逻辑。

## 接口需求与协作材料

- [学术分析模块接口需求说明](academic-analysis-interface-requirements.md)：提交给 A、B 审核的证据输入、结论关联、趋势与冲突分析、引用置信度及评测需求草案。

返回[学术洞察模块总览](academic-module-ownership.md)。
