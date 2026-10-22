# Agent Note: 学术研究任务独立于查看页面运行

Status: implemented

[English](2026-10-12-academic-background-run.md) | 中文

## 问题

现有 `runStream` 把 Remote 调用方的 AbortSignal 用作研究操作的取消信号。关闭弹窗、切换会话或浏览器断线会取消长时间运行的研究。查看者无法重新打开终态结果，也无法区分取消是否来自用户明确操作。

## 决策

Academic Research Controller 为每个后台任务建立归属单个 Session 的独立身份。`startBackgroundRun` 校验已批准 Brief，先持久化初始状态，再使用任务自有的 AbortController 执行现有工作流。进度、Q6 投影、取消意图与终态结果作为完整的 `academic/background-run-state` Session 事件追加。`listBackgroundRuns` 返回有界的发现摘要；`getBackgroundRun` 读取完整最新状态。`watchBackgroundRun` 发送当前状态和后续变化，断开订阅不影响任务；只有 `cancelBackgroundRun` 发出用户明确取消。

后台 ID 与工作流的 `RetrievalRunId` 不同；后者在首次进度观察时可用。同一 Session 只允许一个活动后台任务。Host 正常释放时记录 `service_stopped`，中止任务并等待结算。重新打开的 Session 日志若有未结算任务而当前服务没有活动任务，便保留最后的持久观察并报告 `interrupted`；异常停止不推断取消来源。现有检查点恢复属于另一项显式运行，可能重做未结算批次。旧 `run` 和 `runStream` 保留调用方拥有生命周期的语义。

## 考虑过的替代方案

**让 `runStream` 忽略调用方信号。** 不采用，因为已有客户端依赖该调用的取消行为，而且断开的数据流仍不能提供运行发现和终态读取。

**只在 Host 内存保存状态。** 不采用，因为刷新页面或重启服务会丢失运行 ID、进度和已完成报告。

**自动恢复中断任务。** 不采用，因为当前检查点按批次边界恢复，不能恢复任意模型调用；自动重放可能在用户不知情时重复未结算批次。

## 结果

查看者可以离开并重新连接同一个活动任务，完成的报告也可以从 Session 读取。Session 事件保存完整快照和终态数据，会增加日志体积；发现列表只返回简短摘要。服务重启不能保持进程内任务存活，因此报告 `interrupted`，不编造取消来源。正式 Web 页面通过[后台 Web 生命周期](2026-10-12-academic-background-web.zh.md)使用这些操作；[固定数据生命周期预览](2026-10-10-academic-run-experience-preview.zh.md)继续作为独立合成演示。
