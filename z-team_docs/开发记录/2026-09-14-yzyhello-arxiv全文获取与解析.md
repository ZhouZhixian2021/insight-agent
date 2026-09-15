# 开发记录：arXiv 全文获取与解析

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-14 |
| 负责人 | 成员 B，`Yzyhello` |
| 协作人员 | 成员 A（后续工作流接入） |
| 个人分支 | `dev/yzyhello` |
| 任务分支 | `fix/academic-evidence-pipeline` |
| 提交 | `5433be33f408ce740d95cf8b27b3f1cf114d7929 feat(academic): 支持 arXiv HTML/PDF 全文解析` |
| 远程状态 | 已推送，PR 审核中 |

## 目标

补齐学术来源从论文地址取得可定位全文的能力，使 arXiv 等以 PDF 为主要全文入口的检索结果能够进入既有证据抽取流程，同时继续拒绝失败、截断、落地页和不可解析内容冒充完整全文。

## 实际完成

- 扩展 [`WebFetchResult`](../../packages/web/web/src/types.ts)，允许底层 `ctx.web.fetch()` 返回有界 PDF 字节；[`web-fetch-http`](../../packages/web/web-fetch-http/src/provider.ts) 按响应类型读取 HTML、文本或 PDF，并继续执行状态、大小和截断策略。
- 保持模型侧 [`web_fetch`](../../packages/web/tool-web/src/fetch.ts) 只输出文本，PDF 二进制不会进入模型上下文。
- 新增 [`prepareFetchedAcademicFullText()`](../../packages/academic/evidence/src/fetched-fulltext.ts) 与 [`prepareFetchedAcademicPdf()`](../../packages/academic/evidence/src/fetched-pdf.ts)：HTML 生成章节和段落定位，PDF.js 按物理页生成 `page_section` 定位，并对实际规范化 HTML 或 PDF 字节计算内容哈希。
- 新增 [`fetchAcademicFullText()`](../../packages/academic/evidence/src/fetch-fulltext.ts)，按调用方候选地址执行 HTML 优先、PDF 回退，并只返回确认完整的正文。
- [`source-arxiv`](../../packages/academic/source-arxiv/src/normalize.ts) 现在为版本化 arXiv 记录生成 `/html/{id}` 与 `/pdf/{id}` 全文候选地址。
- 同步受影响包的中英文 README、Web 子系统文档、Agent Note、API catalog、依赖锁文件和第三方声明。

## 实际检查

- 相关 academic 与 web Vitest：161 个测试全部通过。
- 针对新增学术全文文件以及 Web PDF 分支的覆盖率检查：语句、分支、函数和行覆盖率均为 100%。
- `pnpm run build:lib:host`、`pnpm run lint:contracts-ready` 通过；pre-push 再次完成 Host 构建和 contracts-ready 类型检查。
- `pnpm run test:docs`：15 项文档快速门禁全部通过；双语配对检查覆盖 1154 对文档且全部一致。
- 包不变量、依赖闭包、可选导入、导出 JSDoc、生成 API catalog 和 `git diff --cached --check` 均通过。

## 风险与限制

- PDF 解析仅支持含可提取文本的文件；扫描件、加密文件和无文本 PDF 会明确失败，当前不引入 OCR。
- HTML 解析依赖语义化正文结构；仅摘要、落地页和非语义化页面不会被认定为完整全文。
- 当前完成的是 B 侧库能力。A 侧工作流仍需把检索记录转换为全文候选地址，调用 `fetchAcademicFullText()`，再把结果交给既有证据生成器并记录 Session。
- 本地验证使用测试夹具和代理响应；当前环境没有完成对 arXiv 站点的稳定实时端到端验收。

## 下一步

- A：在 Academic 工作流中接入全文候选地址、`fetchAcademicFullText()`、证据生成器和 Session 记录。
- B：配合工作流联调真实 arXiv HTML/PDF；只有扫描论文进入验收范围时再评估 OCR。
