# 开发记录：B-H4 失败分类与证据保护

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-24 |
| 负责人 | 成员 B，`Yzyhello` |
| 协作人员 | 无 |
| 个人分支 | `dev/yzyhello` |
| 任务分支 | `dev/yzyhello-b-h4` |
| 提交 | 与本记录同批提交，提交号以 Git 历史为准 |
| 远程状态 | 从任务分支向 `master` 提交 PR；审核与合并状态以 GitHub 为准 |

## 目标

让来源搜索、单条引用核验和全文候选解析的失败有明确原因，同时保留已核验的论文元数据。Web 发现内容不得充当正式论文正文或证据。

## 实际完成

- [Academic Source](../../packages/academic/source/src/index.ts)在官方记录已核验但没有全文候选时返回 `fullTextFailure: fulltext_unavailable`；全文候选解析出错时仍保留官方成果，并记录分类后的解析失败。官方记录不存在仍返回 `not_found`，调用方取消仍中止操作。
- 搜索批次只把限流、超时和网络错误标记为可重试；非预期 Provider 错误改用通用消息，避免把原始错误细节带入批次。引用格式错误、未识别网页及其他单条核验失败继续使用已有的识别问题和分类结果。
- [证据模块](../../packages/academic/evidence/README.md)继续要求经过确认的完整 HTML/PDF 和可定位的逐字片段。文档明确要求调用方使用学术来源解析出的全文 URL，Web 搜索摘要及 Provider 生成答案不能作为论文正文；直接传入片段的调用方负责核实来源。
- [来源测试](../../packages/academic/source/tests/source.spec.ts)覆盖无全文候选、候选解析失败、错误消息脱敏、可重试分类和候选解析时的取消；混合检索测试夹具同步新的核验结果字段。更新中英文 README、学术来源子系统说明、Agent Note、双语配对记录与生成的 Cordis API 目录。

## 实际检查

- 六个相关测试文件共 118 项通过；Source 主模块定向覆盖率的语句、分支、函数和行数均为 100%。Host 和 Client TypeScript 检查、全仓 lint、`pnpm run build`、`pnpm run test:docs` 的 15 项、`pnpm run doc-sync` 的 33 项及 `git diff --check` 通过。
- `pnpm run hygiene` 的 16 项中 14 项通过。当前 Windows 签出把原有 ACP 配置符号链接变成普通文本，导致配置检查失败；本机创建目录符号链接返回 `EPERM`，导致 NodeNext 全包检查无法运行。直接导入修改包构建声明执行 NodeNext TypeScript 检查通过；未将完整 hygiene 写成通过。

## 风险与限制

- `fullTextFailure` 随核验结果提供给混合检索观察值；将它汇总到 Controller 和 Web 展示属于成员 A 的工作。B-H4 不下载全文，也不从 Web 摘要生成证据。
- 通用证据构造 API 允许可信调用方直接提供可定位片段；逐字核对只能证明片段与草稿一致，不能独立证明调用方提供的片段来自官方全文。

## 下一步

- 成员 A 在混合检索统计中投影 `fullTextFailure`，并确保论文选择器只把学术来源解析的全文候选交给证据模块；团队按[混合检索计划](../模块分工/academic-hybrid-retrieval-team-plan.md)继续集成验收。
