# PR：B 侧 OpenAlex 发现、来源隔离与元数据可靠性

## 目标与状态

从 `dev/yzyhello` 向 `master` 交付 B 侧来源实现及验证记录，供 A 接线联调。已快进同步到 `origin/master` 的 `ea9c6ada72`（包含 PR #27、#28、#29）。本交付不是固定研究课题验收通过证明；建议按待联调 Draft PR 审阅，完成集成后再合并。

## 主要改动

- 新增 OpenAlex Provider，原查询单次请求，不自动规划、分页或重试。
- 保持单查询 `searchAll()` 入参和返回类型；通过配置选择实际调用来源，增加单来源超时隔离，返回批次失败和覆盖限制。
- 保留可靠的元数据未知状态；区分发表场所与下载仓储，关联成果级 arXiv 标识以支持已有记录合并，不混用正式版本和预印本全文。
- 通过既有 `limitations` 披露首次公开日期、场所、版本类型以及全文候选缺失/解析失败。
- 未改 A/C 工作流、Remote、页面、共享模型和根集成配置。本地已有 CVF 修补、Web 目录配置和运行日志不纳入本次 PR；按用户要求不纳入 note 文件夹。

## 请 A 处理：接线与三个目录 Provider 清理

@ZhouZhixian2021，请在接入 OpenAlex 时一并评估清理 `source-acl`、`source-cvf`、`source-pmlr` 三个目录检索 Provider。当前主流程不依赖它们搜索整本会议目录；它们也不是已经接好的自动全文补查系统，继续默认挂载检索会造成额外请求和能力误解。

清理需要成套进行：

1. Web `cordis.patch.yml` 中移除三个旧 Provider 的挂载和目录配置。
2. Web `package.json`、根 `tsconfig.base.json`、`tsconfig.host.json` 和锁文件清理对应依赖/构建引用；按实际引用检查清理文档和校验清单。
3. 删除三个旧包前保留并确认当前 CVF 未提交修补的处理方式；删除意味着放弃配置会议目录的专门检索能力。
4. 保留 OpenAlex、arXiv、通用 PDF/HTML 获取与解析，以及已知官方地址的解析逻辑。**删 Provider 不等于不再下载 ACL/CVF/PMLR 网站的论文。**
5. `source/src/catalog.ts` 中的规范化函数仍被 OpenAlex 使用，不要因删目录 Provider 而整文件误删。

接入 OpenAlex 还需由 A 统一补齐包解析依赖、根路径映射、项目引用和锁文件，并在部署配置中明确 `searchProviders` 和 `searchTimeoutMs`。只挂载 OpenAlex 不会自动停掉目录检索；只登记新包也不代表页面已启用。若同时使用 arXiv，应显式加入发现名单。

## 验证证据

- 拉取最新主线后，来源、OpenAlex、arXiv、摄取、证据，以及 A 的 pipeline 和 Controller 范围：12 个测试文件、176 项通过。
- B 侧最新元数据补强此前通过 58 项定向测试、TypeScript 编译、定向 lint、双语配对与空白检查。
- 真实短时串行测试：OpenAlex 12/12、arXiv 12/12 搜索成功；中位耗时分别约 2.09 秒、2.22 秒。另一个直接 arXiv `id_list` 对照请求超时，不包含在 24 次常规查询统计中。
- Transformer 明确标题/标识符定位后，经现有流程取得 `1706.03762v7` 的 HTML 全文，约 4.6 秒，67 段，25566 字符；首次公开日期为 2017-06-12，取得版本更新于 2023-08-02。
- BERT 完整标题发现、ACL 官方 PDF 下载和全文准备已通过独立联网对照；不等于两个论文都完成了模型证据抽取。

## 已知限制与后续工作

- 固定长查询不保证代表作前五召回；A 拥有明确查询的编排，B 不注入测试论文或替换查询。
- OpenAlex 的 Transformer 合并记录含 2025 年日期；聚合发表日期不能当成 `first_public_release`。只有已取得权威记录时才可通过标识符合并补齐，自动权威元数据补查未实现。
- 全文候选不保证下载成功，缺失候选不等于不存在全文；URL 缓存为实例内有界缓存，不保证重启后恢复。
- B 待修：arXiv 当前忽略 Atom `totalResults`，可能返回不准确的 `truncated: false`；已有“上游 6 条、返回 5 条”的实测证据。
- 本次交付没有新的 Session ID、Retrieval Run ID 或报告质量状态。A 已有的真实 Session 验收结果属于其原有组合，不能冒用为 OpenAlex 接线验收。
- 完整构建、包/根配置集成门禁、真实 Web 运行和固定课题验收仍待完成，不将局部测试表述为全部 CI 通过。

## 发布前阻塞记录

- `pnpm run doc-sync` 在执行文档门禁前触发依赖安装，因 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止；未强制删除或重装依赖，完整文档门禁尚未通过。
- GitHub CLI 已恢复 Yzyhello 授权；发布仍需完成提交前检查。本文中的 A 交接事项须随远程 PR 发布后才构成通知。

### 关联文档

- [OpenAlex 发现与超时隔离](2026-09-18-yzyhello-OpenAlex发现与超时隔离.md)
- [搜索稳定性与 Transformer 全文](2026-09-18-yzyhello-搜索稳定性与Transformer全文验证.md)
- [元数据与全文限制补强](2026-09-18-B-元数据与全文限制补强.md)
