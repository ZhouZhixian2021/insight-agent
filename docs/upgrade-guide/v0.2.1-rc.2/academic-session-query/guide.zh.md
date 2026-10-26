---
kind: upgrade-guide
description: "自定义 Academic Research Controller 组合现在必须提供 sessionQuery 服务。"
---
# Academic Research Controller 历史读取

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-api-academic-research-controller` 现在必须使用 `sessionQuery` 读取批准计划、恢复检查点和后台运行历史。没有该服务的自定义组合无法激活 Controller。仓库自带的 Web 组合已提供该服务。

## 迁移

1. 在挂载 Controller 的自定义 `cordis.yml` 或覆盖配置中，通过现有提供者提供 `sessionQuery`，例如 [`@deepseek-ai/dsh-session-query-sqlite`](../../../../packages/session-query/session-query-sqlite/README.zh.md)。如果已经配置提供者，直接复用。
2. 保留 Session 存储及其历史文件。无需转换 Session 格式。
3. 打开已批准的学术计划，启动研究并刷新后台运行列表，确认 Controller 可以读取选中的 Session。历史读取失败会停止依赖它的研究调度，应先排除读取问题再重试。
