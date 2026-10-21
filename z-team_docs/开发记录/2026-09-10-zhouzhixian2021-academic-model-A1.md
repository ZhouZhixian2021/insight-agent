# Academic Model A1 开发记录

## 基本信息

- 日期：2026-09-10
- 负责人：成员 A（ZhouZhixian2021）
- 分支：`dev/zhouzhixian2021`
- 范围：建立 `packages/academic/model` 独立共享包的第一个可用阶段。

## 本次改动

1. 建立 `packages/academic/model` 包，作为学术洞察各模块共享的最低依赖层。
2. 加入五种不透明 ID，防止不同业务标识在 TypeScript 中误用。
3. 加入 `Availability<T>` 五态类型和 `isAvailable()` 纯判定函数。
4. 加入五态聚焦测试、包说明、子系统说明和架构 Agent Note。
5. 登记成员 A 的 A1 至 A6 实施顺序，并接入仓库索引与工程配置。

## 边界说明

本次没有接入 Web 检索、论文提供方、EvidenceCard 生产、跨论文 Claim、报告 UI 或学术工作流。这些内容属于后续 A 阶段或成员 B、C 的独立目录。

## 验证记录

- `pnpm exec vitest run packages/academic/model/tests/availability.spec.ts`：通过，1 个测试覆盖五种状态。
- `pnpm exec tsc -b packages/academic/model`：通过，独立类型构建成功。
- `pnpm run verify-tsconfig-paths`：通过，手写包别名与生成区一致。
- 本次新增的五组双语文档聚焦配对检查：通过。
- 文档字数预算、Markdown 链接和文档标准测试：通过。
- `git diff --check`：通过。
- `pnpm run test:docs`：15 项门禁中 14 项通过；唯一失败是仓库已有且本次未修改的双语配对欠账，涉及旧的 Academic Model 接口样例、学术洞察说明与计划、学术预设 Agent Note 和事件生产消费文档。本次新增文档未出现在失败清单中。
