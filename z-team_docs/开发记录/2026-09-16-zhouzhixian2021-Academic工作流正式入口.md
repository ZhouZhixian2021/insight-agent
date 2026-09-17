# Academic 工作流正式入口开发记录

## 本次范围

成员 A 为既有 Academic 单轮研究工作流增加正式后端调用入口，没有修改成员 B 的全文解析接口，也没有修改成员 C 的界面实现。第一版明确使用 arXiv，并保持一次 Remote 调用等待整轮完成；断线恢复、进度流和多来源全文发现留待后续。

## 完成内容

- 增加生产论文选择函数，按照规范版本、论文类型、撤稿状态、预印本策略、发表时间范围和纳入数量上限进行获取前筛选。
- 将 ResearchBrief 的自然语言纳入与排除规则加入逐篇全文模型请求。
- 模型回答增加明确的 included/excluded 决定和原因；被排除论文保留记录，但不进入证据分析与报告证据。
- 新增 `academicResearch.run` Remote 后端入口，复用既有 Session 的模型配置及 Agent 范围内的 Academic 检索、Web 全文获取服务。
- Web 组合挂载 Academic 来源运行时、arXiv 提供方及 Academic Research Controller。

## Research Brief 审批交接补充

- Academic 计划模板增加唯一的 `academic-research-brief-json` 结构化区块；可读计划和结构化字段在同一次 `exit_plan_mode` 审批中由用户一起确认。
- `academicResearch.run` 不再接受调用方直接传入完整 ResearchBrief，而是从 Session 最近一次成功的计划审批中读取并严格校验该区块。
- 后端根据 Session 与获批计划调用生成稳定 Brief 身份，并补充版本 1 和审批时间，避免前端伪造或意外替换已批准范围。
- 缺少成功审批、结构化区块缺失或字段不合法时，工作流在检索和模型调用前明确拒绝启动；成员 C 只需传入 Session ID、检索词、结果上限和合成数据声明。
- Academic 预设在计划获批后不再用通用 Web 工具重复研究，而是结束当前轮次；成员 C 等待 Session 空闲后调用正式 Remote，避免重复执行和 `session/agent-busy`。
- 本次仍未修改成员 C 的界面代码，也未开始已批准 Brief 的多版本修订能力。

## 当前限制

- 当前正式流水线只保留可提供全文候选的 arXiv；OpenAlex 与 Crossref 元数据来源已由成员 B 删除，新增全文来源仍属于来源模块的后续工作。
- 单次调用不提供断线恢复、持久运行 ID、进度查询、自动重试或长论文分段。
- 本次没有修改成员 C 的报告界面。C 后续可调用 Remote 入口并使用返回的浏览器安全报告结构。

## 验证

Academic Workflow 与 Academic Research Controller 聚焦测试共 6 个文件、125 个测试通过；两个包的 TypeScript 检查、新控制器构建、工作区约束、导出 JSDoc、Cordis 目录生成检查、文档结构与双语配对检查通过。Windows 检出中的 `verify-cordis-config` 仍只报告既有符号链接文件 `apps/cli/tests/profiles/acp/cordis.yml` 被读取为普通文件；本次未为该平台问题增加绕过代码。
