# 开发记录：B-P2 全文获取进度事实

## 基本信息

| 项目 | 内容 |
|---|---|
| 日期 | 2026-09-28 |
| 负责人 | B（yzyhello） |
| 协作人员 | A（zhouzhixian2021，边界确认） |
| 个人分支 | `dev/yzyhello` |
| 任务分支 | 无（直接在个人分支上开发） |
| 提交 | 本地工作区，未提交 |
| 远程状态 | 本地未推送 |

## 目标

为学术研究实时进度补齐 B 负责的全文获取与解析事实：从 `dsh-academic-evidence` 发布逐候选 URL 的获取与解析状态（开始、成功/失败/取消、失败分类、已接受正文类型）。模型分批/尝试/超时与证据验证进度按 A 明确的边界由工作流模型适配层映射，B 不扩展 `EvidenceGenerator`；Web 发现识别/核验事实由 A 的混合检索编排层发布。

## 实际完成

- 新增 `AcademicFullTextObserver` / `AcademicFullTextObservation` 以及 `AcademicFullTextPhase`（`started`/`settled`）、`AcademicFullTextSettlement`（`success`/`failed`/`cancelled`）。
- `fetchAcademicFullText(input, fetcher, signal?, onFullText?)` 增加可选观察者：每个候选尝试开始时发布 `started`，结束时发布 `settled`（含结算、`FailureCategory`、成功的 `bodyKind`）；调用方取消发布 `cancelled` 后再重新抛出；观察者异常被隔离；事实不带时间戳。
- 失败分类映射：`EVIDENCE_FULLTEXT_UNCONFIRMED` → `fulltext_unavailable`；`EVIDENCE_FETCH_STATUS` → `upstream_error`；`EVIDENCE_FETCH_TRUNCATED` / `EVIDENCE_FETCH_BODY_UNSUPPORTED` / `EVIDENCE_PDF_PARSE_FAILED` → `parse_failed`；超时 `DOMException` → `timeout`；其余 → `network_error`。
- 测试：新增 `packages/academic/evidence/tests/fetch-fulltext.spec.ts`，覆盖逐候选开始/成功、候选回退、七类失败分类、取消、观察者异常隔离、空候选。
- 文档：`packages/academic/evidence/README.md` + `README.zh.md` + `README.i18n.yaml`；新增 Agent Note 三件套 `.agents/notes/implemented/architecture/2026-09-28-academic-fulltext-progress-facts.{md,zh.md,i18n.yaml}`。

## 实际检查

- `pnpm exec vitest run packages/academic/evidence/tests` → 5 文件 41 测试通过。
- `pnpm exec tsc -b packages/academic/evidence/tsconfig.json` → 通过。
- `pnpm exec tsx scripts/run-oxlint.ts packages/academic/evidence` → 通过（修正一处 arrow-parens）。
- `pnpm run verify-translation-pairing` / `verify-export-jsdoc` / `verify-agent-note-format` → 通过。

## 风险与限制

- B 侧完成不等于端到端可见：全文候选事实要经 **A 接线**（控制器/工作流把观察者映射到论文 `fulltext_fetch`/`fulltext_parse` 活动、按 `AcademicWorkId + WorkVersionId` 归并）并由 **C** 展示后才可见。
- 观察不带时间戳、按调用绑定；整轮阶段结算仍由 A 聚合。
- 失败分类为 B 侧固定映射；若 A 的进度协议新增类别，需要同步更新该映射。
- 模型分批/尝试/超时与证据验证进度不在本记录范围（A 的模型适配层）。

## 下一步

- A 接线：Controller/工作流为 `fetchAcademicFullText()` 传入观察者，把逐候选事实投影到论文 `fulltext_fetch` 操作与阶段结算，不改 `EvidenceGenerator`。（负责人：A）
- C 展示全文获取/解析进度。（负责人：C）
- 真实运行一轮联调，确认进度帧中能看到逐候选获取与失败分类。（负责人：A/C，待分配具体时间）
