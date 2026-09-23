# Agent Note: Academic Web 引用识别

Status: implemented

[English](2026-09-23-academic-web-reference-identification.md) | 中文

## 问题

Web 搜索结果可能在论文标识符旁包含无关或残缺文本。把匹配到的字符串直接当作已核验论文会引入未经支持的元数据，而空列表也隐藏了候选被丢弃的原因。

## 决策

`identifyAcademicReferences()` 读取单条 Web 结果的 URL、标题和摘要片段，不抓取网页。它识别明确的 DOI、arXiv 编号及 ACL、PMLR、CVF 官方论文路径，包括 CVF Workshop 路径。结果保留发现 URL、对标识符去重，在 `originalValue` 中保留 DOI 的原始写法，并将 DOI 规范值转为小写。

识别器返回 A 定义的 `AcademicReferenceIdentificationResult`。候选存在有效引用时，引用与识别问题一起保留；被丢弃的候选至少带一个问题。没有精确 DOI URL 且出现多个不同 DOI 时，结果报告含糊并暂不采用这些 DOI。若有精确 DOI URL，即使周边文本提到其他 DOI，仍保留该 URL 的引用。只有后续 Provider 核验才能把已识别引用转为学术成果。

## 考虑过的替代方案

对所有未命中情况返回空数组会丢失格式错误和含糊原因。在多个 DOI 中选第一个可能把错误论文关联到 Web 结果。在识别阶段抓取网页会混合引用解析与来源核验。

## 后果

纯识别器可以用固定 Web 候选测试，并且不发网络请求。受支持的路径格式和含糊规则限定了第一版覆盖范围；未知出版商和含糊标识符保留为问题，不进入证据。
