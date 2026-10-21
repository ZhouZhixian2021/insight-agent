# Academic Model A5 整体验收

## 范围与交付

成员 A 在 dev/zhouzhixian2021 完成 A5 共享模型的本地实现与提交准备，包含失败记录、批处理结果、覆盖统计、检索运行、研究阶段、Claim、证据关联、评估记录及当前性核验。提交哈希以 Git 历史为准，本记录不表示已经推送或合并。

主要入口为[模型包中文说明](../../packages/academic/model/README.zh.md)和[实施清单](../模块分工/member-a-academic-model-implementation-plan.md)。成员 C 使用同一组公共类型生成分析结果；生产者和消费方仍负责真实统计、引用集合一致性、语义评审及发布许可。

## 验收结果

- 模型包测试与覆盖率：8 个文件、54 项测试全部通过；所选模型包运行时源码的语句、分支、函数和行覆盖率均为 100%。
- 模型包 TypeScript 项目编译通过；A5 测试的单独 TypeScript 检查通过，包含阶段/结果不合法组合的编译负例。
- 聚焦 oxlint、公开导出 JSDoc、工作区 constraints 通过。
- pnpm run build 通过；直接通过 Node 导入构建后的 ESM 入口，新增函数导出和批处理/覆盖行为检查通过。
- 模型包 publint 无消息，未发现包发布问题。
- pnpm run test:docs：15/15 通过。
- pnpm run doc-sync：31/33 通过；详细限制见下文。
- 固定 B/C 样例能够解析关联；证据更新、证据缺失、哈希缺失和哈希变化的预期与实现一致。
- git diff --check 通过。

## 未解决的既有问题

完整文档检查的 doc graphs 因 academicSource 缺少服务角色分类失败；documentation site checks 的一项测试因 Windows 创建临时符号链接返回 EPERM 失败。这两项与 B 的[既有开发记录](2026-09-14-yzyhello-9.11缺陷修复与证据提取.md)一致。本次不修改这些检查或平台文件，也不将完整文档检查报告为全部通过。

## 后续

本地提交后，可推送个人分支并建立面向 master 的 PR，明确上述未通过项。合并前不能把 C 的消费基线标记为已更新。A6 的解析、迁移、Session、持久化及实际工作流未启动，B 的业务实现未修改。
