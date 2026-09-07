# Academic insight architecture and delivery plan

English | [中文](academic-insight-plan.zh.md)

## Summary

This page stores the non-authoritative working architecture and delivery plan for the Academic insight business. The team can use it to split work, agree on acceptance signals, and report milestone progress; [Academic insight preset](academic-insight.md) remains the source for current product behavior.

## Table of Contents

- [Working plan](#working-plan)

-----

<a id="working-plan"></a>
### Dev Note: Working plan

This section is planning material, not a product promise. Update its statuses, milestones, risks, and assignments when the team changes the delivery decision.

#### Architecture map

Status legend: ✅ available in the MVP; 🔵 recommended next-stage capability; ◻ later capability.

```mermaid
flowchart TB
    U["业务用户 / Business users<br/>研究人员 · 管理者 / Researchers · Managers"] --> UI["✅ Web 学术洞察入口 / Academic insight entry<br/>选择预设 · 输入需求 · 查看报告"]
    UI --> BRIEF["🔵 Research Brief 规范化 / Normalization<br/>主题 · 时间范围 · 读者 · 重点问题<br/>本地资料 · 来源要求 · 交付格式"]
    BRIEF --> PLAN["🔵 研究规划与任务编排 / Research planning<br/>问题拆解 · 检索策略 · 预算控制<br/>停止条件 · 人工确认"]

    subgraph SOURCE["来源接入层 / Source access"]
        LOCAL["✅ 本地资料 / Local material<br/>ziliao · 用户文件"]
        WEB["✅ 通用 Web / General Web<br/>search · fetch · dsh-web-tools"]
        SCHOLAR["🔵 学术数据源 / Scholarly providers<br/>OpenAlex · Crossref · arXiv<br/>Semantic Scholar · PubMed"]
        FULLTEXT["🔵 全文获取 / Full text<br/>开放 PDF · HTML · 补充材料"]
        MONITOR["◻ 持续监测 / Monitoring<br/>新论文 · 引用变化 · 主题订阅"]
    end

    PLAN --> LOCAL
    PLAN --> WEB
    PLAN --> SCHOLAR
    SCHOLAR --> FULLTEXT
    SCHOLAR --> MONITOR

    subgraph EVIDENCE["证据工程层 / Evidence engineering"]
        INGEST["🔵 统一摄取流水线 / Unified ingestion<br/>来源标识 · 抓取时间 · 原始内容"]
        META["🔵 元数据标准化 / Metadata normalization<br/>题名 · 作者 · 年份 · venue · DOI"]
        DEDUP["✅ 版本去重规则 / Version deduplication<br/>DOI · arXiv · 标题作者"]
        LEVEL["✅ 证据等级 / Evidence levels<br/>元数据 · 摘要 · 全文"]
        CARD["🔵 Evidence Card / 证据卡<br/>主张 · 方法 · 数据集 · 结果<br/>限制 · 原文定位 · 引用"]
        GRAPH["◻ 引用与主题图谱 / Citation and topic graph"]
    end

    LOCAL --> INGEST
    WEB --> INGEST
    SCHOLAR --> INGEST
    FULLTEXT --> INGEST
    INGEST --> META --> DEDUP --> LEVEL --> CARD --> GRAPH

    subgraph ANALYSIS["学术分析层 / Academic analysis"]
        TAXONOMY["✅ 研究方向归类 / Direction taxonomy<br/>研究问题 · 技术机制"]
        COMPARE["🔵 论文对比 / Paper comparison<br/>方法 · 数据 · 指标 · 成本 · 限制"]
        TREND["🔵 前沿趋势 / Frontier trends<br/>时间演化 · 热点 · 关键团队"]
        CONSENSUS["🔵 共识与冲突 / Consensus and conflicts"]
        GAP["🔵 空白与机会 / Gaps and opportunities"]
        JUDGMENT["✅ 方向级判断 / Direction judgment<br/>证据强度 · 成熟度 · 适用场景"]
    end

    CARD --> TAXONOMY
    CARD --> COMPARE
    TAXONOMY --> TREND
    COMPARE --> CONSENSUS
    TREND --> GAP
    CONSENSUS --> GAP
    GAP --> JUDGMENT

    subgraph REPORT["报告生成层 / Report generation"]
        TEMPLATE["✅ 学术洞察报告模板 / Report template<br/>范围 · 核心洞察 · 方向地图<br/>代表论文 · 综合判断 · 参考文献"]
        TRACE["✅ 结论可追溯 / Traceable conclusions"]
        MD["✅ Markdown 交付 / Markdown delivery"]
        DOC["🔵 DOCX / PDF 交付"]
        FIG["🔵 图表 / Figures<br/>技术路线 · 时间线 · 论文矩阵"]
        EXEC["🔵 管理层摘要 / Executive brief"]
    end

    JUDGMENT --> TEMPLATE --> TRACE --> MD
    TRACE --> DOC
    TRACE --> FIG
    TRACE --> EXEC

    subgraph QA["质量保障层 / Quality assurance"]
        CITE["🔵 引文有效性 / Citation validity"]
        CLAIM["🔵 Claim–Evidence 一致性"]
        COVER["🔵 检索覆盖度 / Retrieval coverage"]
        FACT["🔵 事实与数字复核 / Fact and number checks"]
        EVAL["◻ 标准评测集 / Evaluation set"]
        HUMAN["🔵 人工审阅节点 / Human review"]
    end

    TRACE --> CITE
    TRACE --> CLAIM
    PLAN --> COVER
    TEMPLATE --> FACT
    CITE --> HUMAN
    CLAIM --> HUMAN
    COVER --> HUMAN
    FACT --> HUMAN
    HUMAN --> EVAL

    subgraph COLLAB["知识与协作层 / Knowledge and collaboration"]
        LIB["◻ 持久证据库 / Persistent evidence library"]
        VERSION["◻ 报告版本 / Report versions"]
        REUSE["◻ 课题复用 / Research reuse"]
        TEAM["◻ 团队批注与审核 / Team review"]
        API["◻ 业务 API / Business API"]
    end

    CARD --> LIB
    MD --> VERSION
    LIB --> REUSE
    VERSION --> TEAM
    TEAM --> API

    subgraph PLATFORM["Harness 平台层 / Harness platform"]
        PRESET["✅ Academic preset / 学术洞察预设"]
        SKILL["✅ academic-insight-report skill"]
        CORE["✅ DSH agent loop · session · tool"]
        HOME["✅ 独立 DSH_HOME / Isolated runtime"]
        PLUGIN["✅ dsh-web-tools plugin"]
        OBS["🔵 可观测性 / Observability<br/>成本 · 时延 · 来源失败"]
        SAFE["🔵 安全与权限 / Security and permissions"]
        MULTI["◻ 有界多 agent / Bounded multi-agent"]
    end

    PLATFORM --> UI
    PRESET --> BRIEF
    SKILL --> TEMPLATE
    CORE --> PLAN
    HOME --> CORE
    PLUGIN --> WEB
    PLAN --> OBS
    SOURCE --> SAFE
    CARD --> MULTI
```

#### Current reading

- The MVP gives users a selectable Academic insight preset, isolated runtime data, local and general-Web evidence access, evidence-level labeling, version deduplication guidance, direction-level analysis, and a traceable Markdown report structure.
- The main delivery gap is a normalized Research Brief and a durable evidence pipeline. Without them, retrieval quality and report consistency depend too much on the wording of each request.
- Scholarly providers and full-text parsing increase evidence quality only after metadata, deduplication, source locations, and evidence records have stable representations.
- Bounded multi-agent execution remains a later optimization because parallel workers need the durable evidence model before their findings can merge safely.

#### Delivery milestones

| Milestone | Outcome | Included work | Acceptance signal | Dependency |
|---|---|---|---|---|
| M0 — Runnable MVP | A user can select Academic insight and receive a structured, source-linked report. | Preset, localized picker, report skill, local files, general Web tools, isolated `DSH_HOME`. | Focused preset, UI, launcher, and documentation checks pass. | None. |
| M1 — Stable research input | Short and detailed requests resolve to the same explicit research specification when their intent is equivalent. | Research Brief fields, defaults, validation, one material clarification, visible confirmation. | A recorded scenario shows normalized scope, time range, audience, focus, source requirements, and output format. | M0. |
| M2 — Evidence pipeline | Each material conclusion can point to a normalized, deduplicated evidence record and an inspected source location. | Scholarly providers, metadata model, PDF/HTML extraction, Evidence Card, source provenance. | DOI and preprint versions merge correctly; metadata-, abstract-, and full-text-only claims remain distinguishable. | M1. |
| M3 — Decision-ready report | Researchers and managers receive consistent analysis with explicit confidence and review results. | Paper comparison, trend/conflict/gap analysis, citation and claim checks, figures, executive brief, DOCX/PDF output. | A benchmark topic passes source validity, claim–evidence, coverage, numerical review, and human approval criteria. | M2. |
| M4 — Reusable research platform | Teams can retain, refresh, review, and integrate research assets across topics. | Evidence library, scheduled monitoring, report versions, team review, business API, bounded multi-agent work. | A repeated topic reuses prior evidence, identifies new material, preserves review history, and exposes approved output. | M3. |

The recommended implementation order is M1 → M2 → M3. M4 begins only when repeated business demand justifies durable shared storage and operational ownership.

#### Team workstreams

| Workstream | Primary responsibility | Main handoff |
|---|---|---|
| Product and research method | Define Research Brief fields, report questions, evidence expectations, and approval criteria. | Versioned research specification and benchmark topics. |
| Retrieval and providers | Implement scholarly-source connectors, access policy, retries, and source provenance. | Normalized source documents with stable identifiers. |
| Evidence and analysis | Own deduplication, Evidence Cards, comparison, trend, conflict, gap, and confidence rules. | Auditable claims linked to inspected evidence. |
| Web and report experience | Present research input, progress, evidence, report navigation, export, and review states. | User-visible workflow and delivery artifacts. |
| Quality and evaluation | Maintain benchmark topics, invalid-source cases, citation checks, coverage measures, and human review rubrics. | Release evidence and regression signals. |
| Platform and operations | Own runtime isolation, permissions, observability, cost controls, persistence, and later bounded concurrency. | Operable deployments with accountable resource use. |

#### Progress reporting

Each team update records four items: milestone status, completed acceptance signals, the next acceptance signal, and a risk or decision that requires ownership. Leadership reporting uses the same structure and summarizes capability value instead of file-level activity.

Use the architecture map as the scope boundary. A proposed capability enters a milestone only when its owner, dependency, acceptance signal, and required evidence are explicit.
