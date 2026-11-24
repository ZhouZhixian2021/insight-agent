---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-24-product-authored-html

English | [中文](2026-11-24-product-authored-html.zh.md)

## Summary

Product report events may store the finished offline HTML alongside their Markdown text.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-24-product-authored-html
baseline: false
changes:
  - root: "event:product/report-v1"
    previous: "2026-11-06-product-investigation-events"
    after: "960c119845fb739dfb0786e59d6b13a626475de8d0afa1866d70729582207e53"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

HTML is optional. Older sessions render their saved Markdown. Older clients can read the Markdown projection in new events. Source numbers and original images in the HTML are bound before the event is written.

<a id="verification"></a>
## Verification

Report tests cover source binding, original image embedding and reader downloads. The November 24 M6 writing replay used the saved summaries and images and opened the HTML offline.

<a id="dev-note"></a>
## Dev Note

None.
