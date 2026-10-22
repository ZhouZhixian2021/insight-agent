# Agent Note: 学术全文获取发布逐候选进度事实

Status: implemented

[English](2026-09-28-academic-fulltext-progress-facts.md) | 中文

## 问题

学术研究进度格式携带论文的 `fulltext_fetch` 阶段，但证据包没有报告论文正在抓取哪个候选 URL、某个候选为何失败。客户端只能看到论文卡在全文获取，却无法得知失败是非 2xx 响应、截断正文、不支持的正文类型、无法确认的文章、PDF 解析错误、超时还是传输失败。模型侧进度由工作流负责；获取事实只存在于 `dsh-academic-evidence` 内，因此必须由该包发布。

## 决策

`fetchAcademicFullText()` 接受一个可选的逐候选观察者。每个候选尝试开始时发布 `started` 观察，结束时发布 `settled` 观察，携带该候选的 `success`、`failed` 或 `cancelled` 结算、共享的 `FailureCategory`，以及成功时已接受的 `bodyKind`（`html` 或 `pdf`）。调用方取消时，在获取调用重新抛出前先发布 `cancelled`。观察不带时间戳，由进度持有方打戳。观察者异常被吞掉，因为进度只用于观察，不能改变获取结果。

稳定的 `EvidenceError` 代码映射到单一类别：`EVIDENCE_FULLTEXT_UNCONFIRMED` 为 `fulltext_unavailable`，`EVIDENCE_FETCH_STATUS` 为 `upstream_error`，`EVIDENCE_FETCH_TRUNCATED`、`EVIDENCE_FETCH_BODY_UNSUPPORTED`、`EVIDENCE_PDF_PARSE_FAILED` 为 `parse_failed`；超时 `DOMException` 为 `timeout`，其余拒绝为 `network_error`。

模型侧事实仍归工作流。单篇论文的分段、尝试、超时、输出不完整与证据验证进度由工作流的模型适配层从既有持久记录映射；`EvidenceGenerator` 维持 `(request) => Promise<EvidenceDraft[]>` 签名。Web 发现的识别与逐条核验实时事实仍归混合检索编排层。

## 考虑过的替代方案

**在整个获取调用结束后只报告一条事实。** 不采用，因为客户端无法显示正在抓取哪个候选 URL，也无法显示在后一个候选成功前前一个候选已经失败。

**复用生成器回调承载全文事实。** 不采用，因为获取发生在任何生成器存在之前；两个阶段的所有者与生命周期不同。

**把获取事实放在返回值上而非观察者。** 不采用，因为调用方需要在每次尝试发生时获得，而不是论文结算后；可选观察者也能保持既有调用与结果不变。

**把原始 `EvidenceError` 代码放进观察。** 不采用，因为进度协议消费的是 `FailureCategory`；稳定代码保留在证据包自身的错误里。

## 结果

工作流及其进度投影可以展示每个全文候选、其结果与类别，而无需深入证据内部；控制器可把论文的 `fulltext_fetch` 操作结算为运行中、失败或成功。证据包新增一个可选参数与一条隔离的观察路径；省略时保留所有既有调用与结果。类别映射与已接受正文类型现在是生产方拥有的事实，而不是客户端猜测。
