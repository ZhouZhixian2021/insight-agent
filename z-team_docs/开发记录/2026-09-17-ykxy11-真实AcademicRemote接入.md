# 开发记录：真实 Academic Remote 接入

## 范围

成员 C，分支 dev/ykxy11。本次先获取 origin，将本地快进至 master 的 0b43e33bd3，包含 A 的 retrievalRun 正式投影。实现和验证完成后，用户授权提交并推送到 dev/ykxy11；PR 由用户自行创建。

## 实现

- 主 Web 侧栏入口改为“学术研究”。通过框架 useSessions 取得当前已保存的 Session；没有可用会话时提示先创建并选择会话。
- 用户输入查询，前端去除首尾空格，经注入回调调用 ctx.remote.academicResearch.run，传递真实 sessionId、query、synthetic: false 和 AbortSignal。
- Remote 成功值直接驱动 settled；结构化失败及抛出异常驱动 error；请求未结算时为 running，不模拟阶段或百分比。
- 一个表单拥有一个 AbortController，防止重复提交。取消按钮调用实际 abort，等待请求结算；如果返回取消结果则显示已有成果，如果传输取消且没有最终结果则明确提示，不伪造服务器取消报告。
- 关闭弹窗、切换 Session 或卸载组件中止请求，并隔离旧请求的迟到成功和失败；新会话不会显示旧结果。
- 页面直接使用正式 AcademicResearchRunValue，删除与 RetrievalRun 的临时交集。继续复用 RunPanel 的三种状态、覆盖统计、来源/论文失败、报告质量、证据、搜索和 Markdown 下载。
- 生产入口移除固定场景选择器。sampleRun 和 scenarioView 移到包内 tests，仅用于测试；生产依赖图不导入它们。
- 主 Web 原有客户端 Remote 集合未选择 Academic 贡献，因此在 packages/api/remotes 中挂载 A 生成的 /remote 产物并导出其类型增强，同时更新对应 workspace 依赖、TypeScript 引用和锁文件。
- 更新中英文 README、子系统说明与 Agent Note，删除“正式 Remote 尚未提供 retrievalRun”的陈旧说明。

## 边界

没有修改 Academic Model、工作流、来源 Provider 或 Controller 的源码/类型。api/remotes 的改动属于现有客户端能力装配。没有增加模型推理逻辑、服务器进度流、自动重试或人工审核操作。Plan 审核与模型选择仍由现有会话和后端校验负责。

结果保留在当前弹窗表单内，关闭或切换会话后清除；不声称具备刷新恢复功能。synthetic: false 代表真实请求，不等于结果经过人工审核。

## 检查

- 5 个模块测试文件、23 个测试通过。覆盖正式调用参数、Remote 成功/结构化错误、运行状态、重复提交、取消、关闭、切换会话、迟到响应、slot 释放和既有报告交互。
- UI 包源码定向 V8 覆盖：语句 100/100、分支 91/91、函数 46/46、行 80/80，均 100%。不代表真实来源完整研究覆盖。
- TypeScript 宿主/客户端项目检查及完整构建通过；定向 oxlint 无错误或警告。
- 真实 Edge 浏览器测试 1/1 通过：使用仓库已有持久化会话夹具，从主 Web 选择实际 Session，通过真实 Remote 收到 Controller 的未审核 Brief 错误。该测试不替换 Controller，不调用外部模型，也不以错误场景冒充完整成功研究。
- Remote 构建产物的真实 HTTP 冒烟测试 1/1 通过。
- 全量 GUI：294 文件通过，1 文件失败；4038 测试通过，1 跳过，1 失败。唯一失败为沙箱禁止目录选择器读取用户目录；正常权限下单文件 13/13 通过。没有将单项复验描述成全量重跑。
- 包依赖策略检查与客户端包规则检查通过；离线冻结锁文件安装通过。
- 完整 doc-sync 文档检查 33/33 通过，git diff --check 通过。

## 查看与复现

启动项目主 Web，选择已保存会话，完成模型选择和 Research Brief 的 Plan 审核，然后点击侧栏“学术研究”，输入查询并开始。前置条件未满足时页面显示后端错误。

浏览器截图：E:/agent/academic-preview/academic-live-remote.png。浏览器用例：apps/web/tests/academic-run-sample.e2e.ts，使用 vitest.web.config.ts；Windows 可设置 DSH_ACADEMIC_BROWSER_CHANNEL=msedge。

本次已验证真实传输和错误回显；没有运行需要联网检索和付费模型的完整学术研究，需要具备已审核 Brief 与可用模型的会话再做业务联调。
