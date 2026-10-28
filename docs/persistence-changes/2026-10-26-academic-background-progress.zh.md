---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-26-academic-background-progress

[English](2026-10-26-academic-background-progress.md) | 中文

## 概述

新增必读的轻量后台进度与继承候选的Q6元数据事件，完整后台检查点的原字段保持不变。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-26-academic-background-progress
baseline: false
changes:
  - root: "event:academic/background-run-progress"
    previous: null
    after: "9284abbbf19e64169ff34e4ff19520423a0d61e5fa9f02b3c1b7f660f7434b9a"
    decision: same-version
  - root: "event:academic/background-run-q6-update"
    previous: null
    after: "a81b174749513e6b65d02ba22aea76dece987e7828503eff76c14537f1315d50"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

Session写入格式保持4。当前读取器保留旧完整状态语义，混合恢复必须匹配Session、后台运行、Brief、检索运行及Q6版本身份。两种新事件均为必读，绝不标为ignorable。旧事件词汇表拒绝新标签；只支持纯progress而不支持Q6元数据标签的读取器也会明确拒绝后者，不会静默丢弃元数据。投影缓存状态版本3使旧缓存重新折叠。慢速实时订阅接收最新待发视图与终态，每条已提交持久进度仍保留。原文件与冻结前代均不改写。离线检查不证明已有大历史重开峰值或持续真实研究内存已经验收。

<a id="verification"></a>
## 验证

三个owner测试文件126项通过；两个外部回归文件5项通过，包含真实runResearchDraft到Session的候选重复预算、所有被测进度前缀恢复、慢订阅合并与abort清理，以及V4事件词汇拒绝且输入对象不变。六文件90规则类型感知lint零诊断。官方完整构建九项通过，包含产物和两套聚合类型检查。原V2/V4、T0和历史失败材料另行保护；未启动产品、ACP、SDK回放或冒烟。

<a id="dev-note"></a>
## 开发备注

无。
