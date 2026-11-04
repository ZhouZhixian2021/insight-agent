# Academic Model A1–A4 质量修复记录

## 基本信息

- 日期：2026-09-10
- 负责人：成员 A（ZhouZhixian2021）
- 分支：`dev/zhouzhixian2021`
- 原因：A1–A4 合并到 master 后，成员 B 在使用共享代码时发现仓库质量检查仍有阻塞。
- 范围：修复发布清单、导出 JSDoc、生成目录、子系统索引和既有 Academic 双语配对；不修改 A1–A4 的业务字段、ID 语义或模块接口。

## 已完成修复

1. 按仓库约束修正 `packages/academic/model/package.json`：`main` 设为 `lib/index.js`，`types` 设为 `lib/types/index.d.ts`，发布文件精确限制为运行时入口和声明文件。
2. 为 `createEvidenceId`、`createEvidenceCardId`、`createEvidenceCardItemId`、`createSourceLocatorId` 和 `createEvidenceSnapshotId` 补充说明正文与 `@returns`，满足导出 API 的 JSDoc 完整性要求。
3. 运行配置目录生成器，在 `docs/config-catalog.md` 及中文对侧登记 `@deepseek-ai/dsh-academic-model` 为库包，并更新配对记录。
4. 在 `docs/subsystems/README.md` 及中文对侧登记 Academic insight 子系统，说明其负责学术成果、版本、Research Brief、证据卡和证据快照。
5. 将固定接口样例的无后缀 README 改为英文，新增等义中文 `README.zh.md` 和配对记录；三个 JSON 样例内容没有变化。
6. 核对 Academic Preset Agent Note、产品说明和交付计划的中英文内容，确认两侧等义后更新陈旧的配对记录。
7. 比较事件矩阵英文生成页与最后确认版本，只把新增的 `plan-mode` 监听方同步到中文对侧，然后更新配对记录。

## 每项修复的作用

- 包清单修复使 Academic Model 同时符合 npm 使用方式和本仓库更严格的 workspace 约束，避免成员 B、C 的 PR 继承 `constraints` 失败。
- JSDoc 修复使公共 ID 创建函数在生成文档和外部消费时具有完整说明，不改变函数返回值。
- 配置目录和子系统索引修复使生成参考与文档导航能够发现 Academic Model，不再把新增页面视为遗漏条目。
- 双语配对修复保证中英文文档以当前内容作为同一确认版本，避免后续正常编辑被旧 hash 阻塞。
- 固定接口样例配对使成员 B、C 可以从中英文入口理解同一组虚构交接数据。

## 对成员 B 的影响

- 本次修复没有改变 `AcademicWork`、`WorkVersion`、`ResearchBrief`、`EvidenceRecord`、`EvidenceCard`、`EvidenceSnapshot` 或任何品牌 ID 的类型。
- 成员 B 可以继续当前来源与证据模块开发，不需要重写已使用的 A1–A4 接口。
- 本修复合并到 master 后，成员 B 应先提交自己分支中的现有工作，再执行 `git fetch origin` 和 `git merge origin/master`；无冲突文件会由 Git 自动保留。

## 验证结果

- `pnpm run constraints`：通过。
- `pnpm run verify-export-jsdoc`：通过。
- `pnpm run verify-config-catalog`：通过。
- 本次涉及的六组双语文档聚焦配对检查：通过。
- `pnpm exec vitest run packages/academic/model/tests`：通过，4 个文件共 11 个测试。
- `pnpm exec tsx scripts/run-oxlint.ts packages/academic/model`：通过。
- `pnpm run test:docs`：通过，15 项门禁全部通过。
- 子系统中英文索引聚焦测试：通过，1 个测试。
- `pnpm run build`：通过。
- `git diff --check`：通过。

## 本机环境限制

- `pnpm run doc-sync` 的 33 项门禁中 32 项通过；唯一失败用例需要在 Windows 临时目录创建符号链接，本机返回 `EPERM`。同一组测试中的 Academic 子系统索引用例已经单独通过。
- `pnpm run hygiene` 的 Academic 相关 `constraints`、`publint`、包依赖、包不变量和构建产物检查均通过。NodeNext 外部消费检查在本机无诊断退出；该检查会创建临时目录符号链接，需要在允许符号链接的环境或 CI 中复核。
- `verify-cordis-config` 读取 `apps/cli/tests/profiles/acp/cordis.yml` 时失败。Git 索引将该路径记录为符号链接（模式 `120000`），但当前 Windows 检出把链接目标文本保存为普通文件；该问题不是 Academic Model 源码或本次修复引入的。

本次属于现有实现的局部质量修复，没有改变架构决策，因此不新增 Agent Note。
