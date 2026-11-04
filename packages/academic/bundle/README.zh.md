---
description: "为 DSH Web 配置提供学术研究能力，包含学术来源、研究控制、报告页面和学术预设。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-academic-bundle

[English](README.md) | 中文

## 概述

此包为 DSH Web 配置增加学术研究能力，统一装配学术来源、研究控制器、页面和学术预设。内置 `web` 配置在公共基座与 Web 包之后加载它。自定义配置可以选择是否加载，无需修改公共 Web 应用。它依赖配套的 Harness 服务，并不是可以独立启动的研究引擎。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用此包

仓库内的 `pnpm run insight:web` 和 `pnpm dsh web` 均使用内置 Web 配置。在同一安装环境中创建自定义配置时，将以下顺序写入其 `package.json` 的 `dsh.profile.bundles`：

```json
["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-academic-bundle"]
```

该包从 CLI 安装位置解析。其他发行环境需要安装版本匹配的接入包及其工作区依赖。安装和解析方式见[配置规范](../../boot/app-boot/README.zh.md#profiles)；已有自定义配置见[迁移说明](../../../docs/upgrade-guide/v0.2.1-rc.2/academic-bundle/guide.zh.md)。

启动后，预设选择器提供学术模式，以及计划、执行和报告操作。本地来源策略和模型额度仍在配置自己的补丁中修改，它在接入包之后生效。补丁会替换整行配置，因此修改单个设置时应保留其他必要字段。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

| 文件 | 职责 |
| --- | --- |
| [cordis.patch.yml](cordis.patch.yml) | 来源注册服务、五类来源和研究控制器默认配置。 |
| [web.patch.yml](web.patch.yml) | 学术 Remote 注册与浏览器页面插件。 |
| [presets/academic.patch.yml](presets/academic.patch.yml) | 学术预设、计划指令，以及从当前安装包解析技能。 |
| [学术技能](presets/academic/skills/academic-insight-report/SKILL.md) | 研究指令及计划、报告模板。 |
| [src/index.ts](src/index.ts) | 空的发行入口；配置组合器通过清单加载补丁。 |

业务算法继续位于 `packages/academic`，Remote 适配位于 `packages/academic/research-controller`，页面功能位于 `packages/academic/ui-research`。原有配置行标识、Remote 名称和 Session 格式保持不变。此包负责装配，不重复实现这些模块。

</details>

<a id="further-exploration"></a>
## 延伸阅读

- [学术系统说明](../../../docs/academic-insight.zh.md)
- [工作流入口](../workflow/README.zh.md)
- [拆分决策](../../../.agents/notes/implemented/architecture/2026-11-03-academic-composition-bundle.zh.md)

<a id="model-experience"></a>
## 模型体验

通过本层装配的预设插件和工作流间接影响模型；原有计划指令和技能资料随配置一起迁移。

#### KV 缓存影响

此次拆分保留提示词内容和研究默认设置。文件系统技能改为从此包中解析，读取内容时可能出现新的资源路径。请求构造和缓存影响继续由预设及工作流的使用方负责。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 完整接入包依赖公共基座与 Web 层。在 Harness 之外复用单项算法时，仍需适配相关依赖；只复制此目录不足以运行。
- 已有学术 Session 事件支持和生成的 Remote 契约仍跨越多个包。
- 自定义的配置组合列表不会自动改写。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

学术注册集中放在此包。上游接入点包括 CLI 依赖、Web 配置选择及旧默认组合的精确迁移。组合测试检查默认启用和纯 Web 配置不加载学术功能；已有 Web 预设端到端测试通过真实 Loader 检查技能加载和计划审批。

</details>
