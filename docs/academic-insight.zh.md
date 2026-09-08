# 学术洞察预设

[English](academic-insight.md) | 中文

## 摘要

学术洞察预设为 Web 会话提供一个面向研究的 Agent，使其能够检查本地资料、搜索和抓取网页来源，并生成证据可追溯的报告。它是本仓库的第一个垂直业务预设；首个版本有意采用单 Agent 和摘要级能力，不会把尚未实现的全文处理或学术数据库支持呈现为可用功能。

## 目录

- [使用预设](#use-the-preset)
- [隔离运行数据](#runtime-isolation)
- [MVP 行为](#mvp-behavior)
- [已实现文件](#implemented-files)
- [报告方法](#report-method)
- [验证](#verification)
- [已知限制](#known-limitations)

-----

<a id="use-the-preset"></a>
## 使用预设

通过项目专用入口运行仓库 Web 应用：

```sh
pnpm run insight:web
```

该入口选择空闲端口、打开带认证信息的链接，并继续通过受支持的 `dsh web` profile 启动。

在新会话页面打开 Agent 预设选择器，并在发送第一条消息前选择 **学术洞察**。会话产生内容后就会固定其预设；如需更换，请新建会话。

直接说明研究需求即可，无需输入 `/plan`。新建的学术洞察会话会在首个模型请求前进入计划模式，把需求整理为结构化 Research Brief 和执行计划。请在 Web 卡片中审核计划：批准后开始研究，也可以选择继续规划并给出修改意见。如果模型没有调用评审工具就停止，学术预设会自动再提醒一次，要求它通过 `exit_plan_mode` 提交完整计划。只有缺少由用户决定且会实质改变研究结果的选项时，Agent 才会提出一次简短澄清。

-----

<a id="runtime-isolation"></a>
## 隔离运行数据

`DSH_HOME` 是 Harness 运行数据目录，其中保存 profile 与已安装 bundle、会话、设置、凭据、Agent 预设、工作区记录和存储索引。未设置时，它解析为账户级 `~/.dsh`，因此两个使用默认值的源码检出会共享这些记录。

`insight:web` 入口在启动 Web profile 前将 `DSH_HOME` 设为当前检出的 `.dsh-runtime`。该 runtime 单独安装 `dsh-web-tools`，并保留已导入的旧会话目录，但不导入 `_no-cwd` 测试会话。需要隔离运行数据时，不要在此检出中直接使用 `pnpm dsh web`。

-----

<a id="mvp-behavior"></a>
## MVP 行为

该预设提供本地文件读写、文件搜索、网页搜索和抓取、Skill 目录、用户提问、计划审核及上下文压缩。它不提供命令行 Shell、子代理、目标、待办、Ralph 或模型编写的工作流。

内置 `academic-insight-report` Skill 提供固定 Research Brief 模板，区分元数据、摘要和全文证据，合并同一工作的不同版本，按研究问题与机制组织论文，并要求实质性结论带引用。批准前的计划阶段只允许少量预检索；检索到的论文文本是不可信数据，不能改变工具权限或报告要求。

-----

<a id="implemented-files"></a>
## 已实现文件

| 路径 | 当前职责 |
|---|---|
| `packages/preset/agent-presets/presets/academic/` | 内置预设元数据与 Cordis 组装。 |
| `packages/preset/agent-presets/presets/academic/skills/academic-insight-report/` | 从用户提供的参考报告提炼的研究方法和报告层级。 |
| `packages/preset/agent-presets/src/display.ts` | 内置预设标识符到本地化键的映射。 |
| `packages/client/ui-agent-preset/src/client/locales.ts` | 选择器的中英文文案。 |
| `scripts/start-insight-web.ps1` 与 `pnpm run insight:web` | 将当前检出绑定到私有 `.dsh-runtime` 的 Windows 启动入口。 |
| `.gitignore` | 阻止运行时会话、凭据、设置和已安装 bundle 进入提交。 |
| 预设、CLI 与 Web 测试 | 预设发现、本地化显示、Web 能力和选择器可见性覆盖。 |

源 PDF `D:\code\insight\Agent学术洞察模板.pdf` 用于提炼报告层级，但不是运行时依赖，也不会复制到软件包中。

-----

<a id="report-method"></a>
## 报告方法

报告首先说明范围、证据限制、核心洞察和方向总览。随后每个研究方向呈现当前关注点、代表工作、已核验的方法与结果、方向判断以及面向目标读者的启示。最后给出跨方向综合洞察、开放问题、结论和编号参考文献。

报告层级随证据调整。它不会强制七个方向、固定发表时间范围、缺少已检查结果的数值对比，或在研究领域和目标读者不支持时强行给出系统启示。

-----

<a id="verification"></a>
## 验证

先运行聚焦的预设与 UI 测试，再执行仓库测试策略要求的文档和 diff 检查。实现记录只报告在当前检出中实际通过的命令。

-----

<a id="known-limitations"></a>
## 已知限制

- 检索使用现有通用 Web 能力；尚未内置 OpenAlex、Crossref、Semantic Scholar、arXiv 或 PubMed Provider。
- 该预设没有 PDF 解析器或持久证据库，因此必须标注仅基于摘要的分析，且不能承诺段落级核验。
- 报告在会话中返回，或按用户明确要求写入工作区文件；目前没有专用研究表单或报告渲染器。
- 长时研究仍采用单 Agent，直到持久证据模型能够在有界并行 Worker 之间保存结果。
- 自动规划只在新会话的首个请求前生效。开始另一个研究课题时，请新建学术洞察会话，不要假定已完成的会话会自动重新进入计划模式。

<a id="further-exploration"></a>
## 延伸阅读

- [架构与交付计划](academic-insight-plan.zh.md)
- [Agent 预设包](../packages/preset/agent-presets/README.zh.md)
- [架构](architecture.zh.md)
- [测试](testing.zh.md)

<a id="dev-note"></a>
### 开发备注

无。
