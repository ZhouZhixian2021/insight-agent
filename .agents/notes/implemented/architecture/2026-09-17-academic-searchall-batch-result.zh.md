# Agent Note：searchAll 将多提供方结果聚合为一个部分成功批次

Status: implemented

[English](2026-09-17-academic-searchall-batch-result.md) | 中文

## 问题

多来源研究需要让单个提供方的失败保留其他提供方的结果，运行也需要覆盖事实——实际调用了哪些提供方、聚合上限之前存在多少记录、是否丢弃了记录、来源携带哪些覆盖限制。团队交接固定了结果形态，而工作流、Controller 与 Web 页面由其他成员并行改动，因此 seam 必须在不逼迫他们同轮修改的前提下发布新事实。

## 决策

`searchAll()` 返回 `AcademicSourceSearchBatchResult`——`providers`、`discoveredRecords`、`batch: BatchResult<AcademicSourceWork>`、`truncated` 与 `limitations`，与交接固定一致。该接口继承 `AcademicSourceSearchResult`：继承的 `works` 镜像 `batch.items`，`truncated` 共用，因此未改动的工作流适配器与 Controller 仍可按扁平形态编译，直到集成轮直接消费批次字段。

seam 等待每个可用提供方，把被拒绝的 `AcademicSourceError` 转换为携带提供方不含凭据消息的可重试 `upstream_error` `ProviderFailure`（非预期的拒绝值归为 `unknown` 且不可重试），并把成果与失败交给共享的 `createBatchResult`。取消会让整轮以 `ACADEMIC_SOURCE_ABORTED` 中止——重抛提供方的中止错误，或在信号已中止时合成一个——绝不编造提供方失败；选择与配置错误继续抛出各自的 `AcademicSourceError` 错误码。

`discoveredRecords` 统计应用聚合 `maxResults` 上限之前各提供方返回的记录数；seam 不施加按提供方的截断，因为固定接口样例把 `discoveredRecords` 固定为超过上限（存在提供方返回量大于 `maxResults`）。提供方通过可选的 `AcademicSourceProvider.limitations` 字段声明来源覆盖限制，从每个被调用的提供方收集——包括失败与零结果的提供方——并在总上限丢弃记录时由 seam 追加一条聚合上限条目。

## 考虑过的替代方案

**只返回五个新字段而不继承扁平结果。** 被拒绝，因为 Controller 把 `searchAll()` 直接转发给类型为 `AcademicSourceSearchResult` 的工作流适配器；扁平字段是让三方轮次保持独立的桥梁。

**保留 `Promise.all` 的拒绝传播。** 被拒绝，因为单个提供方的故障会丢弃其他所有提供方的成功结果，这正是本次改动要消除的缺陷。

**聚合前在 seam 内把每个提供方截断到 `maxResults`。** 被拒绝，因为固定样例的 `discoveredRecords` 通过某个提供方的超量返回超过了上限；提供方收到的请求保持不变，其自身的 `truncated` 标记已经记录提供方侧的丢弃。

**在 seam 内推导覆盖限制。** 被拒绝，因为只有提供方知道自己的覆盖范围；seam 要么硬编码提供方知识，要么编造文本。

## 后果

CVF、ACL Anthology 与 PMLR 通过 `limitations` 声明其仅覆盖配置目录；arXiv 不声明。聚合上限的限制文本用数字生成（`retained 2 of 5`），而非样例中拼写出的数字。消费 `batch`、`providers`、`discoveredRecords` 与 `limitations` 来构造 `RetrievalRun` 与 `CoverageSummary` 的集成轮，应同时退役继承的 `works` 镜像，并可在提供方暴露更细错误粒度后拆分单一的 `upstream_error` 类别。基于脚本化提供方的聚焦套件覆盖零结果成功、单源部分成功、全部失败、取消与聚合上限；controller 与 workflow 套件固定了未改动的适配器路径。
