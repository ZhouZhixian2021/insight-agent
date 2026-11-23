---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-23-product-page-summary-review

English | [中文](2026-11-23-product-page-summary-review.zh.md)

## Summary

New product investigations save full-page summary and review requests with paired results. Product checkpoint version 4 stores reviewed paragraphs bound to their page capture. Synthesis records can omit maxTokens when the route leaves the output budget unspecified.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-23-product-page-summary-review
baseline: false
changes:
  - root: "event:product/checkpoint-v1"
    previous: "2026-11-20-product-image-readings"
    after: "5376920d06b40dd51add940c71a41cc114d7c55993fcfc7cba111ea78900f78e"
    decision: same-version
  - root: "event:product/page-summary-request-v1"
    previous: null
    after: "4f4fc5d0af48103e483d9fe9c3a8544251bc386fd37e300b71e69c93946f4091"
    decision: same-version
  - root: "event:product/page-summary-result-v1"
    previous: null
    after: "27173cd185723a4e598b089503fe37c18931dd521f80273111510e263b061c7c"
    decision: same-version
  - root: "event:product/synthesis-request-v1"
    previous: "2026-11-08-product-synthesis-transient-retry"
    after: "3033c6a130b46f2b256f0fe5fa0ed997bb8f97d74985a964c2c2c476c0545954"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Current readers resume versions 1 through 3 with excerpt extraction and version 4 with the full-page reviewer. Each completed review is matched to its page, source hash, model, input and request sequence. Older readers reject the required new Session event types or reject checkpoint version 4 on resume. Existing numeric synthesis budgets retain their meaning. An omitted budget denotes the route default.

<a id="verification"></a>
## Verification

Three focused Vitest cases in investigation.spec.ts and extraction-model.spec.ts passed. They exercised a final report from reviewed notes, multi-passage corrections, unchanged paragraphs, rejection of incomplete or ungrounded reviews, checkpoint recovery, three overlapping pages and exact Session request/result replay.

<a id="dev-note"></a>
## Dev Note

None.
