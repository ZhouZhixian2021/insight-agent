---
kind: upgrade-guide
description: "产品调查不再接受 fallbackRoutes，也不再于模型请求失败后切换模型。"
---

# 产品调查模型备用线路

[English](guide.md) | 中文

## 变更

产品搜索结果识别与后台调查使用会话选定的模型。模型调用重试仍使用该模型。产品工作流插件不再接受 `fallbackRoutes`；模型请求失败后不会切到其他模型。

## 迁移

1. 从自定义配置或预设补丁中的 `@deepseek-ai/dsh-product-insight-workflow` 插件配置移除 `fallbackRoutes`。
2. 批准或恢复调查前，在产品会话中选择所需模型；重新构建仓库后重启 Web。
3. 查看保存的产品模型请求事件，确认搜索结果识别、提取、审核、跨来源核对及报告综合都使用所选提供方与模型。
