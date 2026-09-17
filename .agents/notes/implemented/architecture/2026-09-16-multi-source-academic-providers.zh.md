# Agent Note: 多学术来源 Provider 共享搜索与全文流程

Status: implemented

[English](2026-09-16-multi-source-academic-providers.md) | 中文

## Problem

学术研究需要来自 arXiv、CVF Open Access、ACL Anthology 和 PMLR 的论文。如果每个来源都复制聚合、规范化、去重和全文分发逻辑，新增来源就会变成跨包修改。

## Decision

`@deepseek-ai/dsh-academic-source` 负责 Provider 注册、`searchAll()`、公平的轮询结果上限、共享目录过滤与规范化，以及 `resolveFullText()`。每个 Provider 只实现可用性、来源搜索、记录解析和有序全文 URL 推导。

arXiv 保留 Atom API 集成。CVF、ACL Anthology 和 PMLR 搜索已配置的官方目录页，因为这些站点没有提供一个适合本运行时的统一查询 API。Web 组合拥有具体会议和论文集 URL 列表，因此新增目录只改配置，不新增运行时分支。

Provider 结果仍进入 `academic-ingestion`，由它负责精确标识符和疑似重复处理。解析后的 URL 仍进入 `academic-evidence`，由它负责 HTML/PDF 获取与解析。来源包不复制这两项职责。

## Package topology

```text
source <- source-arxiv | source-cvf | source-acl | source-pmlr
  |
  +-> ingestion -> evidence -> workflow/controller
```

## Alternatives considered

**单个大型 source 包。** 不采用，因为无关站点解析器和配置会一起变化，单个站点故障也更难隔离。

**通用“输入任意网站 URL”爬虫。** 不采用，因为论文站点的标记、标识符和 PDF 规则不兼容；小型 Provider 才是最小且真实的适配器。

**仅元数据 Provider。** 不采用，因为无法解析全文的结果不能为本工作流的报告贡献证据。

## Consequences

新增来源需要一个包含解析器、URL 规则、聚焦测试和组合行的 Provider 包。为现有 Provider 增加目录只需修改配置。目录型搜索只覆盖配置页面，且当前每次查询都会抓取页面；缓存等实测需要后再增加。

聚焦的 Provider、运行时与控制器测试覆盖聚合、解析、规范化和 PDF 解析。2026-09-16 的真实冒烟测试从四个 Provider 都返回了论文与 PDF 候选；ACL 在把生产环境的无引号链接加入解析器测试后通过较小官方论文集验证，而已配置的数 MB 主论文集仍慢于短时冒烟测试窗口。
