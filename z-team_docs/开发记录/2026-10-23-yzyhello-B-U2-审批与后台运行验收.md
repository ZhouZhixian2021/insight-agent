# 开发记录：B-U2 审批与后台运行验收

## 范围与状态

- 负责人：yzyhello（B）；路线：`upgrade/port-academic`。
- 工作目录：`D:\agent-project\insight-agent-u0`。
- 用户的 59056 服务保持运行；验收使用独立临时目录、独立端口和凭据环境，不改用户会话。本轮修改未提交、未推送。
- B-U2 本机验收通过：真实模型生成、修改、重新批准已录制，并通过无密钥只读回放；后台启动、持久化与浏览器刷新恢复通过。完整论文研究、取消与 Host 重启恢复仍属于 B-U3/U4。

## 迁入修正

- 恢复学术预设遗漏的 `initialActive: true` 与 `missingExitRetries: 1`，首次请求自动进入计划模式。
- 在新版侧栏计划预览中折叠唯一完整的 `academic-research-brief-json` 执行块；可展开阅读，原始 Markdown 和批准内容不变。多个执行块保持可见。
- 学术审批卡的“要求修改”打开意见输入框；非空意见按既有自定义回答发送，不携带批准标签。输入期间禁用批准；返回审批不发送；失败保留意见并可重试。普通计划的操作保持原有语义。
- 窄屏审批操作允许换行，避免批准按钮被卡片裁掉。
- 新增 Web 集成用例，并在 Host 聚合工程登记、从 Client 工程排除。漏登记曾造成 TS2878；修复后清理本次失败编译产生的 60 个源目录临时输出，不改历史或用户源码。

## 无密钥链路验证

`apps/web/tests/academic-plan-review.e2e.ts` 使用仓库正常 Web 装配和 Academic 预设。计划生成、修改和批准重放真实模型 Session；学术检索与 Web 发现的外部接口返回空集合，完整后台状态由真实 Controller 产生。录制输入采用固定 A-PE1 样例的内存派生值，固定样例文件未修改。

1. 普通提问触发学术计划模式，无需用户输入 `/plan`。
2. 侧栏默认折叠执行块，展开可见原始 JSON。
3. 修改起始年份的反馈进入下一次模型请求；重新提交两份计划均通过正式校验。
4. 人工批准后，Controller 读取的是第二份提交对应的 Brief；批准前未启动检索。
5. 启动 Session 所属后台任务，在检索暂停期间刷新页面，仍恢复同一个运行标识。
6. 释放空来源后任务正常结算；再刷新仍读取相同任务、完整进度与终态。
7. JSONL 存储中保留已完成后台状态；运行未被误取消或重复启动；无论文时不产生虚假报告。
8. 批准完成时点的完整 Session、提示词、工具字段与界面预期值归 `snapshots/web/academic-plan-review/` 所有；后台运行在同一用例中按持久化事实单独断言。

## 真实模型凭据

首次使用默认线路的录制返回 `QUOTA / Request quota exhausted`。本轮通过用户已配置的 `abc / volcengine/deepseek-v4.1-flash` 线路完成真实模型录制，凭据仅传给测试子进程，未写入源码或录制。模型配置仍可在原 59056 页面使用。

## 最终检查

| 检查 | 最终结果 |
| --- | --- |
| `pnpm exec vitest run packages/client/ui-plan/tests/plan-preview.client.spec.tsx packages/client/ui-user-questions/tests/plan-review-panel.client.spec.tsx packages/client/ui-academic-research/tests/research-entry.client.spec.tsx` | 3 文件、63 项通过。 |
| `pnpm run build` | 最新产物与其后的 Host/Client 汇总检查全部通过，共 9 项。 |
| `pnpm run lint:contracts-ready` | 全仓 oxlint 退出码 0；仅未修改实验包的既有 unused-disable 警告。此前完整 lint 曾读到失败编译的源目录输出，该残留已清理。 |
| `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/academic-plan-review.e2e.ts`，`DSH_SNAPSHOT=replay`（主机权限） | 最新构建下 1 项完整链路通过，含亮色、暗色及 390px 宽度的修改与批准控件检查。 |
| `pnpm run doc-sync` | 38 项通过、5 项失败。配置目录已通过所属生成器修复并定向检查；其余四项为既有 CLI help 超时、仓库历史引用、旧术语与 Windows 文件符号链接 EPERM。未重复整个聚合检查。 |
| `pnpm run verify-config-catalog`、四组命名双语配对检查、`git diff --check` | 通过；持久化历史、文档类型和文档站构建也已在本轮 doc-sync 通过。 |

B-U2 的实现、真实计划审批录制及无密钥回放已通过；空来源结算不代表完整论文研究成功。完整研究、取消和重启恢复仍属于 B-U3/U4。旧文档与 Windows 回放差异见 [B-U1/U2 补漏记录](2026-10-23-yzyhello-B-U1-U2-迁入补漏与回归.md)。

## 59056 原浏览器计划预览补验

用户原浏览器显示“计划预览不可用”，而相同服务的新浏览器上下文能读取同一会话。两条插件脚本请求均返回 200，版本号与运行服务一致。临时诊断确认 `plan` provider 已注册，但原浏览器的自定义 URL 解析没有提供 hostname，`protocolOf` 因此返回 undefined，把有效计划资源误判为没有 provider。

最终修复集中在 `packages/client/resources/src/client/resources.ts`：保留 URL 解析和 scheme 校验，当浏览器对自定义 scheme 返回空 hostname 时，从原地址读取受限的 ASCII authority 并统一为小写。空 authority、额外起始斜杠与无效地址仍拒绝。此前猜测性的计划地址格式兼容尝试已撤回，计划地址格式保持原样；全部临时诊断日志已移除，不添加依赖，不修改 Session 数据。

新增资源回归在修复前确认空 hostname 会导致协议识别失败，修复后资源生命周期及 ui-plan 四个测试文件共 73 项通过。学术 Web 场景在每次页面加载时模拟空自定义 hostname，覆盖生成计划、修改意见、批准、后台启动与刷新恢复，1 项通过；运行使用项目内已安装的 Playwright 浏览器，耗时 94.15 秒。最新完整构建 9 项、两组命名 README 双语配对检查和 `git diff --check` 通过；最终 `pnpm run lint:contracts-ready` 退出码 0，仅有未修改实验包的既有 unused-disable 警告。

用户在原 59056 页面刷新后明确反馈“正文恢复了”，该预览故障的人工补验通过。该会话已观察到真实计划生成、批准及计划读取；真实模型的生成—修改—批准 Session 录制与回放已在下文补齐；完整论文研究、取消及 Host 重启恢复仍属于 B-U3/U4。会话中记录的搜索接口 402 余额不足不属于本次预览解析故障。

## 真实模型录制与无密钥回放补验

工作目录为本文所列目录，分支为 `upgrade/port-academic`，基座提交为 `2ce5a5113a`，含未提交迁入修改。真实模型使用 `abc / volcengine/deepseek-v4.1-flash`；Web scaffold 以 `listen(0)` 分配独立监听端口，Session 和测试凭据目录由 `mkdtemp` 隔离并在退出时清理。此次录制未保留具体端口号，不将原 59056 用户服务当作录制服务。

录制包含技能加载、模板读取、首次计划、修改反馈、第二次计划和批准后的结束回复。审批反馈要求从 2023 年起纳入论文，测试核对批准 Brief 的起始年份为 2023，且 Controller 的 Brief 身份关联第二次提交。批准前未开始后台检索。

批准完成时点的完整 Session 是回放输入和持久化预期；后台任务继续在同一用例中执行，独立检查运行身份、刷新恢复、空结果结算以及 JSONL 中的完成状态。学术检索与 Web 发现均在外部接口返回空集合，不把外部余额或网络状态混入审批验收。录制中的技能和模板路径以明确的场景标记保存，回放在独立临时副本中解析到当前安装位置；没有放宽通用 Session 正文归一化。

- 真实模型录制：1 项通过，121.60 秒；原始完整录制另留忽略目录备份。
- 无密钥刷新回放：1 项通过，76.27 秒，生成专用提示词与工具字段预期。
- 最终只读回放：移除两个模型密钥环境变量后，1 项通过，70.44 秒；六个录制目录文件的 SHA-256 均未改变。
- 录制语料检查：3 项通过；本机完整研究和 macOS/Linux 回放尚未运行。
- 最新 `build:check` 的 Host/Client 两项通过；README 命名双语配对与 `git diff --check` 通过，录制文件未检出本机存储的凭据值。最新 `lint:contracts-ready` 退出码 0，仅保留未修改实验包的既有 unused-disable 警告。

下一项为 B-U3：固定一篇论文的检索、去重、候选审核、全文、证据定位与失败留存；报告、取消和检查点恢复按 B-U4 继续验收。
