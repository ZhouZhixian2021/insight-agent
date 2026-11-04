---
kind: upgrade-guide
description: "学术注册移出公共 Web 包后，自定义 Web 配置需要选择独立的学术接入包。"
---

# 学术研究拆分为独立接入包

[English](guide.md) | 中文

## 变更

学术来源、控制器、页面注册和预设资料从 `dsh-web-app` 移至 `@deepseek-ai/dsh-academic-bundle`。内置 `web` 配置包含新接入层。已有 `web` 配置若仅包含公共基座和 Web 两个包，启动时会自动调整组合，保留清单的其他字段和原有补丁。自定义的组合列表保持原样，需要加入新包才能继续提供学术功能。Session 数据和原有配置行标识不变。

学术浏览器方法改由 `@deepseek-ai/dsh-academic-client-remote` 注册；只导入公共 API Remotes 不再安装或声明 `remote.academicResearch`。学术接入包包含该注册及业务页面贡献。

## 迁移

1. 在自定义配置的 `package.json` 中，将 `@deepseek-ai/dsh-academic-bundle` 加到 `dsh.profile.bundles` 中的 `@deepseek-ai/dsh-web-app` 后面。现有自定义层放在它后面，以保留覆盖顺序。CLI 安装中包含此包；其他发行环境需要安装版本匹配的完整依赖。
2. 将显式引用的 `@deepseek-ai/dsh-web-app/presets/academic.patch.yml` 改为 `@deepseek-ai/dsh-academic-bundle/presets/academic.patch.yml`。仓库中的技能资料现在位于 `packages/academic/bundle/presets/academic/skills`。选择完整学术包后，不要重复加载学术预设补丁。
3. 自定义 Client 组合需要在 Gateway 之外加载 `@deepseek-ai/dsh-academic-client-remote`；类型消费者导入其 `/client` 入口，并依赖 `remote.academicResearch`。Host 控制器与方法名称不变。
4. 在仓库中运行 `pnpm dsh --profile <name> --dump-config`，确认 `academic-research-controller`、`ui-academic-research` 和 `preset-academic` 各出现一次。随后启动此配置，确认学术预设能读取研究技能。
