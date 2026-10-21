# 开发记录：阶段二 B 证据问题关联验收

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-10-09 |
| 负责人 | yzyhello |
| 协作人员 | A 提供问题索引与覆盖接口 |
| 个人分支 | dev/yzyhello |
| 任务分支 | 无 |
| 提交 | fix(academic): preserve evidence question associations during deduplication |
| 远程状态 | Draft PR；真实模型验收尚未完成 |

## 目标

承接 A 的 questionIndexes 接口，验证真实证据与研究问题的关联经过分段合并、来源核验和覆盖统计后仍然可靠；无直接证据的问题保留缺口，不根据候选 matchedQuestions 宣称覆盖。

## 实际完成

- 修复 [证据分段合并](../../packages/academic/workflow/src/model.ts)：去重身份包含问题索引集合。同一引文对不同问题的关联分别进入核验；仅索引顺序不同的关联仍去重。越界关联不会挤掉后续有效同伴。
- 增加 [模型回归](../../packages/academic/workflow/tests/model.spec.ts)，覆盖跨重叠批次的不同关联、越界关联与有效关联共存、索引顺序变化。旧实现的前两种情况失败，修复后三种情况通过。
- 增强 [覆盖与补检索回归](../../packages/academic/workflow/tests/replenishment.spec.ts)：候选同时匹配两题而有效证据只支持第一题时，第二题保持 uncovered，supportingWorkIds 与 evidenceIds 为空，并保留 gaps。流程继续处理候选至已批准收录上限。
- 更新 [SDK 会话回归插件](../../packages/academic/workflow/tests/snapshot-plugin.ts)及 academic-evidence、academic-limited-draft 快照，要求相同引文的两种问题关联均被接纳。
- 增加 [真实接口验收](../../packages/academic/workflow/tests/question-links.e2e.ts)：获取 Attention Is All You Need 的 arXiv v7 HTML 全文，调用一次 deepseek-v4-flash，要求架构问题获得逐字核验后的证据关联，而年度碳排放问题没有关联。无密钥时跳过；有密钥但调用失败时仍失败，不自动重试。
- 同步 workflow 双语 README 与现有抽取恢复 Agent Note；未改变查询预算、渠道选择和前端界面。

## 实际检查

- 公开全文获取：HTTP 200，返回 HTML 含 article；真实测试已成功经过全文解析。
- 相关单元测试：model、replenishment、evidence/extract 首轮 76 项通过；新增未覆盖问题回归后，replenishment、retrieval、candidate-batches 共 24 项通过。
- model 全量单元回归：51 项通过。单文件覆盖率门禁失败，statements 92.24%、branches 84.72%、functions 100%、lines 92.47%；未覆盖位置位于既有配置、批次空输入及异常分类路径，新增关联合并路径已执行。没有降低阈值或排除缺失分支。
- SDK 两个学术场景：正式刷新与独立回放均通过，各 2 项；首次刷新因旧构建产物失败，已恢复原输入并重新生成完整会话，未保留失败输出。
- workflow 及其依赖 TypeScript 项目构建通过；workflow、evidence、model、source、analysis、report、ingestion 当前运行产物已打包。
- 变更 TypeScript 的 staged lint 通过；git diff --check 通过。
- 文档快速门禁 test:docs：15 项通过。doc-sync 首轮 32 项通过、配置目录新鲜度失败；生成目录缺少共享 Controller 已有的两项缺口查询预算字段，已补齐生成结果，verify-config-catalog 补跑通过。
- 真实模型验收失败：DeepSeek 返回 HTTP 402 / QUOTA / Insufficient Balance。没有得到模型证据结果，不能宣称真实抽取已验收通过。

## 风险与限制

- 六条草稿上限仍按独立问题关联计数；不同关联不会在逐字核验前合并。
- 模型问题关联仍需语义审查；逐字来源核验只证明引文存在，不证明所有推论正确。
- 当前验收不是完整检索到报告的真实端到端研究流程。真实模型抽取与单文件 100% 覆盖门禁尚未通过。

## 下一步

- yzyhello：账户恢复可用余额后重新执行真实接口验收，确认架构问题有证据、碳排放问题无关联。
- 待分配：补齐 model.ts 既有异常路径覆盖，使单文件覆盖率达到仓库门禁要求。
- A/C：在审核后的证据图上验收逐题 supportingWorkIds、evidenceIds 和 gaps 展示。
