# Agent Note: Academic Remote Agent 服务查找

Status: implemented

[English](2026-09-17-academic-remote-agent-service-lookup.md) | 中文

## Problem

Academic Remote 创建的检索和获取适配器会在之后读取 `agent.ctx.academicSource` 与 `agent.ctx.web`。控制器把这两个服务声明为自身依赖，但 Agent 上下文属于另一个 Cordis Fiber，不会继承控制器 Fiber 的属性访问授权。因此，真实运行会在检索前以 `cannot get property "academicSource" without inject` 失败。

## Decision

控制器解析 Agent 后，立即通过 `agent.ctx.get()` 一次性解析 `academicSource` 和 `web`。Agent 范围内的服务缺失时，控制器返回明确的 Remote 可用性错误。流水线适配器捕获已经解析的服务，不在维护工作期间从其他 Fiber 读取服务属性。

这保留了 [Academic Remote 执行](../architecture/2026-09-16-academic-remote-execution.zh.md)中由目标 Agent 提供 Academic 与 Web 能力的决定。它不回退到控制器上下文，也不修改 B 的 Provider、A 的工作流接口或 C 的返回字段。

## Alternatives considered

**从 `this.ctx` 读取服务。** 控制器 Fiber 可以访问自身声明的依赖，但这会忽略为该 Session 选择的 Agent 范围或隔离 Provider。

**把控制器依赖添加到每个 Agent 上下文。** Agent 上下文拥有自己的生命周期和插件组合。把另一个插件的依赖声明授予它会削弱 Cordis 服务归属，异步回调仍会耦合到上下文属性访问。

**保留延迟属性读取。** 已发布组合已经证明该方式会在首次 Provider 调用前失败，并且同一模式会在 Web 全文获取时再次失败。

## Consequences

检索和全文获取使用目标 Agent 可见的准确服务，也可以从控制器维护操作中调用。范围内的服务缺失时，工作流会在开始前失败。控制器测试把服务与 Agent 上下文组合为同级 Cordis Fiber，复现此前手工根上下文夹具未覆盖的生产访问规则。
