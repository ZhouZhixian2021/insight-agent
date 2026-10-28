# Agent Note: 学术 HTML 交付

Status: implemented

[English](2026-10-26-academic-html-delivery.md) | 中文

## Problem

学术报告需要能在实时 Web 应用之外阅读的文件。重新生成一份正文可能丢失引用来源链接与证据标识，直接导出应用标记则可能保留活动代码或远程资源。

## Decision

已返回的报告面板在 Markdown 之外导出单文件 HTML。它通过 React 静态渲染，在惰性模板中复用现有 Markdown 渲染器，再序列化允许的元素及安全链接属性。模型原始 HTML 保持文本，仅恢复生成器专属的数字段落锚点。样式内联，排除脚本与外部资源，CSP 禁止活动内容。引用保留为明确链接，图片转换为替代文本。报告质量、合成标记、限制和证据引用始终可见，不受当前界面筛选影响。

## Alternatives considered

让模型重新编写 HTML 报告会增加成本并产生另一份未经支持的解释。保存当前面板标记会带入筛选结果及框架控件。手写 Markdown 解析器会重复维护现有渲染能力。惰性导出复用已有解析器，同时明确控制导出元素。

## Consequences

文件可以离线打开，不需要凭据或 Harness 服务；点击外部引文目标仍需要网络。Markdown 继续保留原始文本及不支持的排版。导出只是展示操作，不改变报告审核。定向测试覆盖正常、有限、空证据、恶意标记及真实 Web 下载。

阅读排版借鉴 [Quarto](https://quarto.org/docs/output-formats/html-basics.html) 的侧栏导航和 [Tufte CSS](https://github.com/edwardtufte/tufte-css) 的克制排版，不复制其代码或新增依赖。正文先于折叠的补充核对资料，本地证据简称保留完整记录。依据列表在论述旁折叠。交付未达标原因直接显示，内容限制明确显示数量。源 Markdown 和交付判断保持不变。定向测试覆盖顺序、可达锚点、完整记录和输入不变性；浏览器视觉与打印验收尚未完成。
