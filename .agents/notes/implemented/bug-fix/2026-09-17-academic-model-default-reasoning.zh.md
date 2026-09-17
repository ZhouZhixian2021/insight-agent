# Agent Note: Academic 模型默认推理强度

Status: implemented

[English](2026-09-17-academic-model-default-reasoning.md) | 中文

## Problem

Academic 应用入口会把未指定的推理强度改成 `low`。未声明可选推理强度的已配置模型路由会在检索前被拒绝，即使同一路由在不传推理参数时能够运行。

## Decision

[`runAcademicResearchDraft`](../../../../packages/academic/workflow/README.zh.md)把未指定的推理强度原样交给 `resolveCallConfig`，由所选提供方和模型使用自身默认值。调用方明确指定的值仍属于解析后的调用配置；所选路由不支持该值时，预检会失败。预检仍在检索或全文获取前完成。

该决定只取代 [Academic 论文交接](../architecture/2026-09-15-academic-paper-handoff.zh.md)中的默认推理强度说明。工作流仍要求明确提供方、模型和输出上限，也不修改 B 的检索接口或 C 的报告接口。

## Alternatives considered

**继续把 `low` 作为应用默认值。** 一次成功联调不能证明所有模型路由都支持该值。保留这个默认值会阻止其他可用模型进入流水线。

**为当前自定义提供方声明支持 `low`。** 推理参数及其传输值属于部署配置中的模型元数据。仓库不能断言所有使用同一模型名称的端点都接受该参数。

**跳过推理能力校验。** 这会把明确的配置错误推迟到提供方请求阶段，并可能在失败前消耗检索工作。

## Consequences

Academic 研究可以使用未开放可调推理强度的模型。调用方省略该设置时，提供方可以选择不同的内部推理级别。需要 `low` 的调用方必须选择声明支持该值的路由，并明确传入。

[模型测试](../../../../packages/academic/workflow/tests/model.spec.ts)覆盖在支持和不支持可调推理的路由上省略强度、明确指定受支持强度，以及在检索前拒绝明确指定但不受支持的强度。
