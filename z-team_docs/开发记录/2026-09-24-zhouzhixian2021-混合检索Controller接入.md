# 混合检索 Controller 接入（A-H3b）

## 本次目标

在 B 已提供按计划指定 Provider 检索接口后，把 A-H3a 混合检索执行器接入正式 `academicResearch.run`。用户批准的第 3 版计划可以执行，不再被“尚未接入 A-H3”的临时保护拒绝。

## 修改与调用顺序

1. 在 `packages/api/academic-research-controller/src/search.ts` 增加内部适配器 `approvedSearchAdapter`。它按已批准的查询表达取得策略；未批准的表达在调用任何来源前被拒绝。
2. Controller 继续重新读取当前 Session 的批准记录并检查 Brief 身份。带策略的查询进入现有 `executeHybridSearch`；没有策略的历史查询保留 `searchAll` 路径。
3. 学术通道使用 B 的 `academicSource.searchProviders(request, approvedProviders, signal)`，不拿部署的全局来源选择代替单次批准范围。
4. Web 通道使用 DSH 的 `web.search`，只转交发现链接及截断状态。Web 生成的回答被丢弃；标题和片段仅用于引用识别，不成为证据。
5. B 的纯识别器提取引用，再调用 `academicSource.verifyReference`，只允许该引用对应且经计划批准的 Provider。只有核验成功的论文进入既有去重、选文、全文获取、抽取和报告流水线。
6. 沿用流水线传入的候选上限与取消信号，Web 发现和引用核验各自遵守批准预算。单侧失败保留另一侧成果。
7. Controller 的检索阶段结算同时计入 `search`、`web_search` 和 `verify_reference` 失败，避免把 Web 或核验失败展示成全部检索成功。

业务实现集中在 Controller 的 `src/search.ts` 和 `src/index.ts`；`src/types.ts` 仅更新当前语义说明，没有新增公共字段。本次没有修改 B 的具体学术源实现、DSH 通用 Web 服务或 C 的页面。

## 验证

- Controller 与混合检索执行器定向测试：5 个文件、103 个测试通过。包含真实 Controller 调用及论文流水线，模型和上游响应使用合成输入。
- 新增适配器测试：挂载真实 Academic Source 和 Web 服务，核对批准来源覆盖部署默认值、Web/核验预算、禁用渠道、历史路径、单侧失败、分类失败与取消。
- 新增 `snapshots/sdk/academic-hybrid-search`：通过 DSH 已有 `sdk-minimal` 配置启动真实 Loader，重放一次工具调用，验证学术搜索、Web 发现及 ACL 官方记录核验。独立断言工具成功，固定结果仅包含已核验论文；不依赖真实网络或密钥。
- Controller TypeScript 构建检查与定向 lint 已通过。
- 中英文 README、架构记录、团队计划与索引同步更新。`doc-sync` 首轮 32/33 通过，唯一失败为新增导入导致配置目录的 Controller 源码行号过期（31 → 32）；已重新生成英文目录并同步中文行号，随后单独复查配置目录与双语配对。

本机最初仍使用 B 新接口之前的构建产物，导致 Loader 回放找不到新方法。重建 Academic Source 后已通过。快照改为显式引用本仓库构建入口，检查时创建的三个临时依赖链接已移除，并再次通过独立回放。

## 边界与下一步

- A-H3b 本地实现及无密钥验证完成；本次未提交、推送或合并。
- A-H4 尚未完成：详细渠道观察、Web URL 数、引用核验数与失败明细尚未投影到 `hybridRetrieval`。字段缺省不表示某渠道未执行。当前继续返回既有论文覆盖统计、分类失败与限制说明。
- 尚未进行真实网络、真实模型或浏览器端到端验收；合成回放不能证明外部检索服务可用。
- 下一步按团队计划推进 A-H4，并在正式服务中验收已批准混合计划到报告的全过程。

关联计划：[学术洞察混合检索团队分工](../模块分工/academic-hybrid-retrieval-team-plan.md)。
