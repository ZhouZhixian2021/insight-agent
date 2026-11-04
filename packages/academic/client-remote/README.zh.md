---
description: "通过公共 Remote 传输将学术浏览器控件连接到研究控制器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-academic-client-remote

[English](README.md) | 中文

## 概述

使用本包将学术浏览器控件连接到研究控制器。学术接入包会自动加载它。自定义浏览器组合可以将它与公共 Gateway、匹配版本的控制器一起加载。本包不增加研究命令或凭据。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

选择[学术接入包](../bundle/README.zh.md)，它会在研究页面之前加载本插件。自定义组合需要 Gateway 的客户端 Remote 传输与匹配的 Host [研究控制器](../research-controller/README.zh.md)。导入本包的 `/client` 入口以取得学术 Remote 类型扩展，调用前依赖 `remote.academicResearch`。公共 API Remotes 不再安装学术方法。

<a id="understand-the-implementation"></a>
## 实现说明

客户端入口挂载控制器生成的 `/remote` 描述并返回注销函数，卸载时通过 Gateway 既有生命周期移除命名空间。空的 Host 入口支持 Loader 发现，不另建传输或服务器。编译位于 Client 阶段，在 Host 控制器生成描述之后进行。

<a id="model-experience"></a>
## 模型体验

### 浏览器方法注册

#### 模型看到什么

安装 `remote.academicResearch` 不会增加模型可见消息、工具或提示词。调用研究操作时，模型行为仍由对应工作流负责。

#### Token 影响

挂载或卸载浏览器方法不消耗模型 Token。研究请求可以调用已配置的工作流。

#### KV Cache 影响

无直接影响。调用研究操作时，模型行为仍由对应工作流负责。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制

- 需要兼容的 Gateway 与生成后的研究控制器描述，单独复制目录不能作为独立 API 客户端。
- 不转发额外 Host 事件，也不注册后端控制器。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

学术接口注册放在本包，公共传输保留在 Gateway。注册包变化时同步更新接入包的浏览器补丁与页面依赖。

</details>
