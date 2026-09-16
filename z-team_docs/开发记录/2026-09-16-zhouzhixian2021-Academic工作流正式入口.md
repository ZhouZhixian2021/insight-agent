# Academic 工作流正式入口开发记录

## 本次范围

成员 A 为既有 Academic 单轮研究工作流增加正式后端调用入口，没有修改成员 B 的全文解析接口，也没有修改成员 C 的界面实现。第一版明确使用 arXiv，并保持一次 Remote 调用等待整轮完成；断线恢复、进度流和多来源全文发现留待后续。

## 完成内容

- 增加生产论文选择函数，按照规范版本、论文类型、撤稿状态、预印本策略、发表时间范围和纳入数量上限进行获取前筛选。
- 将 ResearchBrief 的自然语言纳入与排除规则加入逐篇全文模型请求。
- 模型回答增加明确的 included/excluded 决定和原因；被排除论文保留记录，但不进入证据分析与报告证据。
- 新增 `academicResearch.run` Remote 后端入口，复用既有 Session 的模型配置及 Agent 范围内的 Academic 检索、Web 全文获取服务。
- Web 组合挂载 Academic 来源运行时、arXiv 提供方及 Academic Research Controller。

## 当前限制

- OpenAlex 与 Crossref 当前可检索元数据，但尚未提供完整流水线所需的全文候选地址；该能力属于成员 B 的来源适配工作。
- 单次调用不提供断线恢复、持久运行 ID、进度查询、自动重试或长论文分段。
- 本次没有修改成员 C 的报告界面。C 后续可调用 Remote 入口并使用返回的浏览器安全报告结构。

## 验证

Academic Workflow 与 Academic Research Controller 聚焦测试共 6 个文件、125 个测试通过；两个包的 TypeScript 检查、新控制器构建、工作区约束、导出 JSDoc、Cordis 目录生成检查、文档结构与双语配对检查通过。Windows 检出中的 `verify-cordis-config` 仍只报告既有符号链接文件 `apps/cli/tests/profiles/acp/cordis.yml` 被读取为普通文件；本次未为该平台问题增加绕过代码。
