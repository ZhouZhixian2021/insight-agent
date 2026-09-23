# Agent Note: 学术单条引用核验

Status: implemented

[English](2026-09-23-academic-single-reference-verification.md) | 中文

## 问题

Web 结果可识别出看似有效的论文 URL 或编号，但不能证明论文存在，也不能证明标题、作者、版本与全文位置属于该论文。为核对一条候选而扫描完整 ACL、PMLR 或 CVF 目录，还会增加不必要的请求和延迟。

## 决策

`AcademicSourceRuntime.verifyReference()` 先检查调用方的 Provider 允许列表，再把单个 DOI 交给 OpenAlex、arXiv ID 交给 arXiv，或把带来源命名空间的官方记录交给 ACL、PMLR、CVF。即使目录搜索没有配置页面，已注册 Provider 仍可核验单篇记录。Provider 未注册属于配置错误；官方记录不存在或不匹配则返回单条引用失败。

arXiv 使用 `id_list` 并核对明确指定的版本。OpenAlex 读取 DOI 单篇端点并比对返回的 DOI。ACL、PMLR、CVF 只读取该论文的官方页面、解析引用元数据，并核对官方记录或 PDF URL。PMLR 将页面给出的 PDF URL 保存在有容量限制的实例缓存中，因为官方论文也可能把 PDF 发布在推导路径之外。结果包含规范化成果和全文候选，不包含已下载或已抽取的正文。

## 考虑过的替代方案

只接受看似有效的 URL 或成功的 HTTP 响应，无法核验论文元数据。为每条 Web 结果重新搜索完整目录会增加工作量，也可能漏掉未列入配置目录的论文。读取单篇页面后仍使用推导出的 PMLR PDF 路径，可能指向不存在的文件。

## 后果

五个 Provider 可结算一条已识别引用，而不扩展其引用网络。官方记录缺失、传输错误、限流和解析失败保持区分；调用方取消会中止操作。全文安全、下载限制、解析和证据生成仍由下游抓取与证据包负责。
