# 开发记录：B-U4 报告与生命周期验收

## 范围与结论

- 负责人：yzyhello（B）；目录：`D:\agent-project\insight-agent-u0`；分支：`upgrade/port-academic`；基座：`2ce5a5113a8c94bec67cb351c55b75b87b8fc66f`，包含未提交迁入修改。
- 验收范围为单篇研究的后台结算、订阅断开、取消、检查点恢复、历史结果读取及草稿下载。未操作用户的 59056 服务或会话，未修改 T0 固定样本及已提交 Session 世代。
- 真实后台任务完成并保存结果；新增 Controller 恢复用例验证序列化后由新实例读取，跳过已提交检索和已结算全文批次。报告页保留 `draft / needs_review`，不把运行完成解释为最终审核通过。
- 取消专项复现并修复两处问题：服务停止错误写入取消终态；被中断的批次仍被结算而导致恢复跳过未完成论文。用户主动取消仍为不可恢复终态。

## 修复与验证方式

[后台任务](../../packages/api/academic-research-controller/src/background-run.ts)使用专门的 Host 停止原因。[Controller](../../packages/api/academic-research-controller/src/index.ts)在该原因导致取消结果时不写入 `academic/run-settlement`，保留可恢复的未结算历史；显式用户取消继续记录终态。[流水线](../../packages/academic/workflow/src/pipeline.ts)在论文组被中断后保留批次开始前的检查点，不提交该批次结算。

[Controller 回归](../../packages/api/academic-research-controller/tests/controller.host.spec.ts)以全文请求进入屏障为停止时点，使用真实 `runResearchDraft` 和固定外部适配器，分别触发服务释放与用户取消。新实例读取序列化事件后，服务中断可以重试未完成批次，用户取消在下载前被拒绝。另有两个场景把事件写入独立临时文件，释放原实例，再恢复待处理或已结算检查点；已结算批次不再下载，原检索运行 ID 保持不变，最终后台结果可由第三个实例读取且不再派发研究。

修复前的服务停止用例返回“学术研究已取消，无需恢复”；仅区分停止原因后，恢复返回空论文。保留未完成批次后，续跑得到已抽取论文。过程日志分别位于 `.dsh-runtime/u4-stop-regression-before.log`、`u4-stop-regression-after.log` 和 `u4-stop-regression-fixed.log`；最终结果以通过的检查为准。

## 真实后台结果

[真实固定论文用例](../../packages/api/academic-research-controller/tests/academic-single-paper.e2e.ts)改用 `startBackgroundRun`，取得首个订阅状态后断开监听，等待同一后台任务结算。随后严格读取持久化 Session，并比较其中重建的完整后台结果与服务结果相等。真实批准输入、论文、查询及模型线路延续 B-U3。

- 用例 1 项通过，191.57 秒；隔离端口 `50077`，临时服务及数据目录由测试清理。
- 模型：`abc / volcengine/deepseek-v4.1-flash`。
- Session：`session-0a4a6451-e513-4d4d-9d8c-394d086e6c28`；检索运行：`b2cdfc57-99da-46fd-8983-4b9e13ed442a`。
- 后台任务：`6f062edf-d32f-4482-9f59-3639e2361c1a`，55 条状态事件，终态 `completed`，`cancelReason: null`。
- 两条发现记录归并成一篇 arXiv `1706.03762v7`；检索、全文及抽取均成功，失败操作 0 次。抽取保存 5 条可定位证据，报告保留其中 3 条证据。
- 综合完成，报告为 `draft / needs_review`，独立审核结论为 0。来源陈述仍需语义审核，单篇结果不能替代跨论文研究。

证据目录为 `.artifacts/academic-single-paper/run-ZwejrT/`，包含环境、结果、证据和完整 Session；另导出 `report.md`、`report.html` 与 `report-mobile.png`。真实完整模型运行在取消专项修复前通过；修复后的完成路径由回归与审批快照回放继续核对，没有为相同模型结果重复付费运行。

## 报告交付检查

真实 Chromium 打开上述结果经现有独立报告渲染器生成的 HTML，核对待审核状态、无已审核结论的空态、3 条证据、证据展开、筛选、390px 宽度和无脚本异常。下载的 `academic-report.md` 与结果中 Markdown 逐字相同。该检查不启动 Web 服务，也不替代 C 的 HTML / Trace 对接验收；脚本与结果保存在 `.dsh-runtime/u4-report-check.mts` 和 `u4-report-browser-result.json`。

## 本地检查

| 检查 | 结果 |
| --- | --- |
| Controller、后台生命周期、恢复重建、流水线、补检与历史归因兼容 6 个文件 | 修复后 168 项通过，见 `u4-fixed-regressions-final.log`。 |
| 研究入口、报告面板、独立页面交互、报告业务与流水线 11 个文件 | 127 项通过，见 `u4-report-ui-regression.log`；与上一组包含重叠的流水线用例。 |
| 服务停止／用户取消与序列化恢复专项 | 4 项通过，见 `u4-stop-regression-fixed.log`。 |
| README 双语配对 | Controller 与 workflow 两组一致。 |
| 文档预算与导出 JSDoc | 分别通过 7 个预算文档及全包导出文档检查。 |
| `pnpm run build:artifacts`，修复后的最新源码 | 7 项通过，见 `u4-artifacts-after-fix.log`。 |
| 随后的 `pnpm run build:check` | Host/Client 两项通过，见 `u4-build-check-complete.log`。 |
| 五个修改的生产与测试文件定向 oxlint | 退出码 0，见 `u4-lint-complete.log`。 |
| 已有学术计划生成、修改、批准与后台刷新场景的无密钥回放 | 1 项通过，70.70 秒，见 `u4-plan-snapshot-replay.log`。 |
| 本地结果与报告凭据扫描 | 6 个文本文件，凭据值命中 0；见 `u4-artifact-credential-scan.log`。 |

首次完整构建发现新增测试没有处理可选的全文取消信号，修正该测试后重新生成全部产物并通过 aggregate 检查。审批回放的沙箱执行截图显示 `EPERM realpath C:\Users\30847`，没有进入模型回放；依仓库规则在宿主环境原样重跑后通过，失败日志保存在 `u4-plan-snapshot-sandbox.log`。全量 doc-sync 的既有失败沿用 B-U2 记录，本轮不重复全量检查。

## 支持范围

恢复是显式 API 操作；页面不会自动续跑。历史缺少执行检查点时仍明确返回 `candidate_state_missing`；已完成或用户已取消的运行拒绝恢复。没有重新解释或改写旧版已结算记录，包括此前已经写成取消终态的服务停止记录。

本轮的新实例恢复不是独立 Node 进程强制重启实验；多来源主题、真实模型请求中途取消、macOS/Linux 矩阵及 C 的 HTML / Trace 集成仍待相应共同验收。后端修复需要运行中的旧服务重新启动后采用；未替用户终止手工服务。代码未提交、未推送。
