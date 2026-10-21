# 负责人 A：架构与编排

## 角色定位

负责人 A 负责学术洞察的共享接口、研究流程编排、Academic Preset 和跨模块集成，并承担最终架构一致性与合并协调。

## 拟议负责目录

- `packages/academic/model/`
- `packages/academic/workflow/`
- `packages/preset/agent-presets/presets/academic/`
- 与学术洞察相关的正式架构文档

## 主要交付

- Research Brief、计划审核、执行和恢复的状态定义。
- A、B、C 共用的学术数据类型与版本策略。
- 检索、证据、分析、报告模块的组装与生命周期衔接。
- 合并顺序、发布组合和跨模块验收。

## 协作边界

- A 对共享类型作最终决定；B、C 的需求文档作为设计输入，不作为阻塞性审核。
- 不在通用 DeepSeek Harness 包内加入仅供学术业务使用的条件分支。
- 不替代 B 的来源与证据实现，也不替代 C 的分析、报告和产品实现。

## 接口设计与决策材料

- [Academic Model v1 共享数据设计草案](academic-model-v1-design.md)：汇总已确定规则、候选公共对象和由 A 决定的开放项。

返回[学术洞察模块总览](academic-module-ownership.md)。
