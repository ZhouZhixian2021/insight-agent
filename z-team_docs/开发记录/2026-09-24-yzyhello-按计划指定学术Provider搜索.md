# 开发记录：按计划指定学术 Provider 搜索

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-24 |
| 负责人 | 成员 B，`Yzyhello` |
| 个人分支 | `dev/yzyhello` |
| 提交 | 与本记录同批提交，提交号以 Git 历史为准 |
| 远程状态 | 从个人分支向 `master` 提交 PR；审核与合并状态以 GitHub 为准 |

## 目标

为 A-H3 后续集成提供按已批准计划的 `academicProviders` 精确搜索入口，避免直接调用受部署配置控制的 `searchAll()` 时请求计划范围外的学术来源。

## 实际完成

- [Academic Source](../../packages/academic/source/src/index.ts) 增加 `searchProviders(request, providerIds, signal)`，按请求指定的 Provider ID 执行搜索，不受部署的 `searchProviders` 配置影响；复用现有多来源批次结算、取消、上限与失败处理。
- 空列表、空白 ID、重复 ID、缺失或不可用的 Provider 在调用任何来源搜索前失败；[回归测试](../../packages/academic/source/tests/source.spec.ts)确认计划外来源未被调用。
- 同步包 README、[子系统接口说明](../../docs/subsystems/academic-source.zh.md)、生成的 Cordis 接口目录及[混合检索决策记录](../../.agents/notes/implemented/architecture/2026-09-22-academic-hybrid-retrieval-contract.zh.md)，并更新双语配对记录。

## 实际检查

- `pnpm exec vitest run packages/academic/source/tests/source.spec.ts`：1 个文件、60 项测试通过。
- `pnpm exec tsc -p packages/academic/source/tsconfig.json --noEmit`、修改文件的 `pnpm exec oxlint`、`git diff --check`：通过。
- `pnpm run gen-cordis-catalog`：接口目录已更新；`pnpm run doc-sync`：33 项通过。

## 风险与限制

- 本次只补学术来源服务入口。A-H3a 双通道执行器已合并，但 Controller 尚未接入已批准的混合检索策略；本记录不宣称完整混合检索可运行。

## 下一步

- 成员 A 在工作流和 Controller 集成时传入每条查询获批准的 `academicProviders`，并验证实际调用列表与计划一致。
