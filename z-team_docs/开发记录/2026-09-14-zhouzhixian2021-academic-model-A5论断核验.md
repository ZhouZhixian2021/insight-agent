# Academic Model A5 论断与证据核验

## 范围

- 负责人：成员 A（ZhouZhixian2021）。
- 当前分支：dev/zhouzhixian2021。
- 本步实现 Claim 共享表示与纯核验函数，不实现 C 的分析算法、语义评审、真实模型调用或报告发布。

## 实际实现

- [claims.ts](../../packages/academic/model/src/claims.ts) 提供 ClaimRecord、ClaimEvidenceLink、ClaimAssessment 及结论类别、置信度、证据关系、评估状态和核验结果类型。
- 复用 ClaimId，新增 ClaimEvidenceLinkId、ClaimAssessmentId；三类记录都有独立 ID 创建函数。
- [checkClaimFreshness](../../packages/academic/model/src/claim-freshness.ts) 比较当前 Brief 身份/版本，以及当前证据的身份、成果归属、版本和哈希。
- 已知变化或已有 stale Claim 得到 stale；缺失证据、空快照、空白或不可用哈希得到 unverifiable；全部可比较信息一致才得到 current。
- 已知变化优先，但缺失原因也保留；核验不修改历史，current 不表示语义正确或获准发布。
- 固定 B/C 样例的关联解析、版本变化与其他核验预期已接入模型包聚焦测试。JSON 在此仅作为受控样例读取，不提供生产解析器。

## 验证

- 模型包已有及新增 Claim 测试：7 个文件、52 项通过；固定样例测试另有 1 个文件、2 项通过，共 54 项。
- 模型包编译和 A5 结果、检索、Claim 测试的单独 TypeScript 校验通过。
- 固定样例测试的单独 TypeScript 校验通过。
- 模型包聚焦 oxlint、公共导出 JSDoc 和 git diff --check 通过。
- pnpm run test:docs：15 项全部通过，包含双语配对与文档引用检查。

## 边界

全部 A5 改动尚未提交或推送。A6 解析、迁移、Session、持久化以及工作流集成未启动；B 的业务源码没有修改。消费者仍负责引用集合一致性和语义支撑检查，不能用 freshness 代替分析评估。
