# Academic Model A5 检索运行记录

## 范围

- 负责人：成员 A（ZhouZhixian2021）。
- 当前分支：dev/zhouzhixian2021；从本地 master 快进个人分支后切换，第一步和文档阶段的未提交成果全部保留。
- 本步是检索运行共享数据实现，没有执行工作流或检索。

## 实际实现

- [RetrievalRun](../../packages/academic/model/src/retrieval.ts) 绑定运行 ID、Brief ID 与内容版本、执行顺序查询、提供方、成果、覆盖统计和失败。
- ResearchStage 固定为规划、等待批准、运行、完成、失败和取消六种状态。
- 类型区分未结束与终结记录：前者结果状态与结束时间为 null，后者必须携带两项；完成可以部分成功，取消保留成功成果。
- createRetrievalRunId 生成独立品牌 ID，不使用 Brief ID 或外部来源 ID 代替。
- 更新模型包、子系统及既有 Agent Note 的双语说明。未新增流程执行、自动状态转换或重复的批准判定。

## 验证

- 模型包：6 个测试文件、34 项测试通过。
- 模型包 TypeScript 项目编译通过；新增测试单独进行 TypeScript 编译，错误阶段/结果组合的负例校验通过。
- 模型包聚焦 oxlint、公共导出 JSDoc、git diff --check 通过。
- pnpm run test:docs：15 项全部通过；锁文件没有修改。

## 后续

下一步是 ClaimRecord、ClaimEvidenceLink、ClaimAssessment 和证据当前性核验。当前修改尚未提交或推送，A5 未全部完成。
