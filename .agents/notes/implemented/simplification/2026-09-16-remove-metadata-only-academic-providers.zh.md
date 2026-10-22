# Agent Note: 移除仅提供元数据的学术来源 Provider

Status: implemented

[English](2026-09-16-remove-metadata-only-academic-providers.md) | 中文

## 问题

Academic 研究工作流分析可定位的全文。OpenAlex 和 Crossref Provider 只返回规范化的书目信息，不提供 HTML 或 PDF 候选地址，因此其结果无法进入全文证据流水线。保留这些包会扩大受支持的 Provider 范围，却不能改善当前研究流程。

## 决策

仓库保留 arXiv 学术来源 Provider，并移除 OpenAlex 和 Crossref Provider 包。新增 Provider 除了把记录规范化成 `AcademicWork` 和 `WorkVersion`，还必须发现可分析的 HTML 或 PDF 候选地址。Provider 中立的来源 seam、摄取去重、DOI 标识符以及通用 `openalex` 外部标识符类型继续保留，因为它们不会执行 OpenAlex 或 Crossref 检索。

Provider 规范化决策继续适用于 arXiv；其中 Crossref 专用实现由本次移除决策取代。

## 曾考虑的替代方案

**保留但禁用这些 Provider。** 否决，因为未启用的生产包仍需要测试、文档、生成目录和兼容性维护，而工作流无法消费其结果。

**把仅含元数据的记录作为分析输入。** 否决，因为书目信息和摘要无法满足工作流对可定位全文证据的要求。

**为 OpenAlex 或 Crossref 增加出版方 PDF 发现。** 否决，因为这些注册服务并不保证存在可访问的全文材料。直接提供 HTML 或 PDF 链接的会议或出版平台才是合适的 Provider 边界。

## 后果

在其他全文 Provider 实现前，当前组合只搜索 arXiv。删除这两个包也会删除其配置项和依赖图节点。基于 DOI 的版本合并保持不变，后续全文 Provider 继续复用现有来源、摄取和证据包。
