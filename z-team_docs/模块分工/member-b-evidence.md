# 负责人 B：检索与证据

## 角色定位

负责人 B 负责从学术来源获取论文数据，将数据标准化、合并、去重，并产出可追溯的证据记录。

## 拟议负责目录

- `packages/academic/source/`
- `packages/academic/source-openalex/`
- `packages/academic/source-crossref/`
- `packages/academic/source-arxiv/`
- `packages/academic/ingestion/`
- `packages/academic/evidence/`

## 主要交付

- 学术来源接口和 OpenAlex、Crossref、arXiv Provider。
- 论文元数据标准化、版本合并和去重。
- Evidence Record、Evidence Card、来源定位和引用所需字段。
- 来源失败、限流、缺失数据和重复记录的明确处理结果。

## 协作边界

- 来源接口和共享数据字段由 A 审核。
- 证据字段必须邀请 C 审核，确保能够支持分析与报告。
- 不负责最终趋势结论、报告措辞或专用 Web 页面。

返回[学术洞察模块总览](academic-module-ownership.md)。
