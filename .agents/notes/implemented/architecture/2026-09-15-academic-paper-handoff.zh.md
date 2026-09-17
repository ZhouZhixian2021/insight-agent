# Agent Note: Academic paper hash handoff

Status: implemented

[English](2026-09-15-academic-paper-handoff.md) | 中文

## Problem

全文解析结果已有哈希，检索版本仍可能未提取哈希。直接传递原版本会使下游证据关系不完整。

## Decision

[workflow 库](../../../../packages/academic/workflow/README.zh.md)在抽取前补齐版本副本。首次补齐保留 ID，原对象不变；哈希冲突暂停该论文并返回可保留的记录，调用方继续其他论文。历史绑定由调用方明确声明，不能自动把所有缺失哈希解释为首次观察。

## Alternatives considered

首次获取就新建版本会人为制造版本选择问题。覆盖已有哈希会破坏历史证据。两者均不采用。

## Pipeline

runResearchDraft 串联现有检索、去重、全文、证据、分析和草稿报告入口，选择在网络和模型调用前整体校验。单篇失败或暂停不会中断其他论文；取消保留已完成结果。调用方明确提供范围选择和外部适配器，函数仅运行一轮，报告不加入语义批准。实现文件不反向导入公共 index，避免 A 包内部循环导入。

## Consequences

工作流要求模型只选择直接回答研究问题的证据，每篇最多六条，以一个研究问题为主要依据的证据最多三条；无关细节不纳入，并采用最短的支持性摘录。parseEvidenceDrafts 执行六条上限，在返回任何条目前按 B 的六栏草稿字段检查不可信模型 JSON。它逐项构建带类型的值，不依靠类型断言信任回答；拒绝额外字段及模型生成的失败身份，原文匹配继续由 B 负责。解析失败不会伪装成成功的空抽取。该解析器没有网络或 Session 副作用。[解析测试](../../../../packages/academic/workflow/tests/parse-evidence.spec.ts)覆盖格式错误及数量超限回答，并把合格草稿交给真实 B 抽取器。

B、C 的接口保持不变。A 的 PaperEvidenceGenerator 增加解析来源参数，单参数生成器仍可赋值。createModelEvidenceGenerator 将活动 Session 和显式模型配置绑定到 DSH 的预备调用，发送已记录的不可变请求，使用现有 token 估算及输出预留，并记录无损模型流。超长论文返回 input_too_large，普通论文失败保留其他成果；追加、保存或读回失败抛出 WorkflowLogError 停止整轮，即使同时发生取消。仅用于记录的 academic/evidence-request 和 academic/evidence-result 不进入主模型历史；validated 表示 JSON 校验，不代表语义审核。进程异常退出后的缺失结果不会自动重试。

SessionStore.flush 表示有监听器参与，不证明活动写入器已保存该会话。适配器在刷新后读回每条事件，执行用户确认的保存失败即停止策略。模型容量和输出上限来自显式配置及提供方解析，预算未知时发送前失败。按用户选择，沿用共享估算器并保留其近似性质。完整工作流恢复及长论文分批仍待后续。

## Testing

runModelResearchDraft 将已有生成器绑定到调用方拥有的 Session，使用明确的检索、选文、获取和时钟适配执行单轮流水线。集成测试将两篇解析后的论文送入真实模型服务、B 的证据构建和 C 的评测草稿；同时证明实际模型容量检查会暂停超长的第一篇并继续下一篇，结果保存失败会阻止下一篇获取。包装入口不增加存储格式、默认模型路由或自动发布。

runAcademicResearchDraft 是面向应用的对象参数入口。它在外部论文处理前预检准确模型路由，推理强度未指定时沿用模型路由默认值，保留并校验调用方的明确选择，并随流水线结果返回持久化 Session ID。因此，明确选择但不支持的推理强度会在检索前失败，而不会变成单篇抽取失败。该入口仍不替调用方选择提供方、模型、选文策略或发布目标。[模型默认推理强度修复](../bug-fix/2026-09-17-academic-model-default-reasoning.zh.md)负责该默认值决策。

[模型测试](../../../../packages/academic/workflow/tests/model.spec.ts)使用 DSH 的真实模型服务、计数器和 JSONL 持久化，仅为外部模型提供预设回答，覆盖磁盘读回及存储/取消竞态。回放归一化按 Assistant 流的规则处理学术结果流时钟，不改变请求或回答内容。[Academic SDK 场景](../../../../snapshots/sdk/academic-evidence/snapshot.yml)通过已发布的 sdk-minimal 配置完成基准生成和只读回放，覆盖 B 的证据构建、持久化记录及 TypeScript SDK 通知和返回结果。场景关闭终端工具，保留的编辑工具不被调用。Windows cwd 的 JSON 转义修复解决了初始启动失败；原有完整配置标题场景仍存在 Bash/PowerShell 工具说明差异。显式开启的 [Python 进程测试](../../../../python/sdk/tests/test_academic_snapshot.py)通过构建后的 dsh CLI，把源码 SDK 的事件和通知与预期投影及原始磁盘记录比较；不等同于已安装 wheel 或真实模型提供方验收。Python SDK 关闭时仍输出未关闭流的 ResourceWarning，保留为后续事项而不屏蔽。

[交接测试](../../../../packages/academic/workflow/tests/handoff.spec.ts)连接实际 HTML 解析和证据抽取，验证首次补齐、复用、暂停后继续其他论文、身份冲突、历史保护及取消。
