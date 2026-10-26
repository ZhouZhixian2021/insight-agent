# 开发记录：B-U3 固定论文真实链路验收

## 范围与结论

- 负责人：yzyhello（B）；工作目录：`D:\agent-project\insight-agent-u0`。
- 分支：`upgrade/port-academic`；基座：`2ce5a5113a8c94bec67cb351c55b75b87b8fc66f`，含未提交迁入修改。
- 本轮新增真实 Web 装配验收用例，不改变生产检索、全文或模型处理逻辑，不修改 T0 固定样本或用户的 59056 会话。
- 固定论文为《Attention Is All You Need》，arXiv `1706.03762v7`。两条精确检索记录归并为一篇，候选模型审核、PDF 全文和一级证据抽取通过；综合生成的是 `needs_review` 草稿。
- B-U3 的单篇真实链路通过；多来源主题、报告交付、取消、检查点恢复及 Host 重启恢复仍待 B-U4 与共同验收。

## 验收条件

[真实用例](../../packages/api/academic-research-controller/tests/academic-single-paper.e2e.ts)通过仓库的 Web scaffold 启动正式 base/Web 装配和 Academic 预设，使用真实 arXiv 与 Session 选择的真实模型。批准计划是测试预置输入，按完整 turn、step、assistant、tool 生命周期保存并在运行前严格回读；本轮不替代 B-U2 的真实计划生成、修改和人工审批录制。

两条批准查询分别为 `"Attention Is All You Need" AND au:Vaswani` 和 `"Attention Is All You Need" AND au:Shazeer`；每条仅取一个结果，整轮最多处理一个候选。研究问题为该论文提出何种神经网络架构，不从单篇结果推导跨论文比较。Web 发现关闭，证据必须来自论文全文并具有位置与内容哈希。

现有 arXiv Provider 会为查询加 `all:` 前缀，不能直接把以 `id:` 或 `ti:` 开头的完整原生查询放入该字段。初次错误输入的 HTTP 400 保留为 `upstream_error`，后续全文与证据未运行，未产生报告；修正为上述标题加作者约束后，两个真实 API 查询均返回同一 `1706.03762v7`，各自 `totalResults=1`。没有为适配测试修改 Provider 的生产语义。

模型通过已有 `abc / volcengine/deepseek-v4.1-flash` 线路调用。`ACADEMIC_LIVE_PATCH` 只选择测试覆盖文件；实际凭据从本机存储读取后传给测试子进程，没有写进源码。测试覆盖使用单论文并发、一次抽取尝试、90 秒候选与抽取超时、4096 抽取输出上限、8192 综合输出上限。Web 录制装配还要求非空 `DEEPSEEK_API_KEY`；自定义线路实际使用自己配置的凭据环境变量。

## 首次通过的真实结果

- 用例：1 项通过，199.08 秒。
- 端口：`61144`；隔离 workspace：`C:\Users\30847\AppData\Local\Temp\dsh-web-e2e-ws-yADZLA`；隔离持久化目录：`C:\Users\30847\AppData\Local\Temp\dsh-web-e2e-sessions-xy8cvM`。临时目录与服务在退出时清理。
- Session：`session-719ce7c3-ae00-4022-99e4-0aa4b32847b0`；研究运行：`91924e10-6163-4ddc-aa85-1161bc655d01`。
- 检索记录 2 条、去重后论文 1 篇；纳入论文与可用全文各 1 篇，失败操作 0 次。
- 候选语义审核有 1 条正式验证结果；研究阶段 `search / fulltext / extraction` 均为 `success`。
- 一级证据 5 条，没有被拒绝的草稿。来源为 `https://arxiv.org/pdf/1706.03762v7`，定位到 PDF 第 1、2、3 页；各条证据与定位对象共用论文版本及内容哈希 `sha256:bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697`。
- 候选审核、范围判断、三次证据批次和综合的模型结算均为 `validated`；持久化 JSONL 保留研究结算事件。
- 综合完成，报告模式为 `draft`，质量为 `needs_review`。检索结果仍显式保留有界截断和未知发表 venue 的说明，不能宣称全面检索或正式审查通过。

原始本地证据位于 `.artifacts/academic-single-paper/run-SeGHok/`：`environment.json`、`result.json`、`evidence.json` 和 `session.v4.jsonl`。这些文件包含模型输入和论文正文片段，保留在忽略目录，不作为公共快照提交。最终复验新增证据上限、论文身份断言并缩短读取句柄生命周期，仍通过，详见下文。

## 最终复验与测试归属

最终真实复验 1 项通过，216.45 秒；端口为 `58997`，Session 为 `session-ae39b14e-9d86-484c-8719-fb66e961befc`，研究运行为 `093b7ea0-5c93-4524-b1ab-f2772eb1b7e5`。本轮仍为两条发现记录归并成一篇，5 条全文证据，失败操作 0 次；候选审核、范围判断、三个证据批次及综合均正常验证，报告仍为待审阅草稿。

最终环境、结果、证据与完整 Session 保存在 `.artifacts/academic-single-paper/run-LhKUty/`，另从结果中的原始 Markdown 导出 `report.md` 便于人工阅读。隔离数据目录为 `C:\Users\30847\AppData\Local\Temp\dsh-web-e2e-ws-xsIrJp` 与 `C:\Users\30847\AppData\Local\Temp\dsh-web-e2e-sessions-2v84Lw`，退出后已清理。

用例最终归入 Controller 的 `tests/`，复用 Web 测试装配以读取公开研究响应之外的证据关联与持久化事实，不把 Controller 业务验收归为 CLI 装配验收。真实运行在移动前完成；移动只调整相对导入，移动后另做类型、lint、双语配对和无密钥跳过检查。

## 本地检查

| 检查 | 结果 |
| --- | --- |
| 检索筛选、语义审核解析、全文下载/解析、PDF、一级证据与候选池交接 7 个单元文件 | 39 项通过。 |
| arXiv Provider 与 Atom 解析 2 个单元文件 | 31 项通过。 |
| `pnpm run build:check`，最新用例后的检查 | Host/Client 2 项通过。 |
| `pnpm exec oxlint packages/api/academic-research-controller/tests/academic-single-paper.e2e.ts` | 退出码 0。 |
| Controller README 命名双语配对 | 1 组一致。 |

本轮未重复已登记有既有失败的全量 doc-sync；没有运行 macOS/Linux 的真实接口矩阵，也未做 B-U4 的取消或重启恢复。代码未提交、未推送。
