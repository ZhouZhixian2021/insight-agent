---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-06-product-investigation-events

English | [中文](2026-11-06-product-investigation-events.zh.md)

## Summary

Adds product investigation source text, page declarations, complete recovery checkpoints, model, evidence, claim, cross-source comparison, report, settlement, and background task events.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-06-product-investigation-events
baseline: false
changes:
  - root: "event:product/background-run-v1"
    previous: null
    after: "ccb7bf8644155dcbd5626ca6e4a589de69349309fa03a367c9e56a354053f7cc"
    decision: same-version
  - root: "event:product/checkpoint-v1"
    previous: null
    after: "a0c4d38d45e00978060a12913d2350a48a5075b355a0d1c56f4079192f787282"
    decision: same-version
  - root: "event:product/claim-review-request-v1"
    previous: null
    after: "607da22033187a771db7dd16a4230f1112b413d0e360ab4bc0ecd229679d58ec"
    decision: same-version
  - root: "event:product/claim-review-result-v1"
    previous: null
    after: "b52a7cb897726e74e47a01a37ae7ee054bced1ecac10b597e948fee53970390d"
    decision: same-version
  - root: "event:product/claims-v1"
    previous: null
    after: "f44c9708b7489b881a5aeb2122ebd4db4ef8219f2ce995e6f0d19f6c67cb901c"
    decision: same-version
  - root: "event:product/cross-check-request-v1"
    previous: null
    after: "980982f87e2d69b235035f880b888bf58a39fdc79a14e7c0e19086cc2d859c7a"
    decision: same-version
  - root: "event:product/cross-check-result-v1"
    previous: null
    after: "8efe21ebef8a8fff62e8eb10e0bb6191b7e321ad4fce5308430c8c477a292c83"
    decision: same-version
  - root: "event:product/evidence-v1"
    previous: null
    after: "13aef66b887b28a8cee414c10236199efe1294f4aaaaae3de6c36b5637537670"
    decision: same-version
  - root: "event:product/model-request-v1"
    previous: null
    after: "6437fe92e2153299cb4532b53cd117520e9067b88c983e8ce9c0fea1e84e1d58"
    decision: same-version
  - root: "event:product/model-result-v1"
    previous: null
    after: "9102a1928ae6c204311e8b741963ee687981a8f2f7919b8f5496a0fa4c8862a1"
    decision: same-version
  - root: "event:product/pages-v1"
    previous: null
    after: "e526e5619fe0f1f2a7cdf258172392b648389395edf5276df2e8e60648ca99a6"
    decision: same-version
  - root: "event:product/report-v1"
    previous: null
    after: "4bd74c7dfde3a1dc1a87413827ec3995af5ff234b90269fa53077afc0e070597"
    decision: same-version
  - root: "event:product/run-settlement-v1"
    previous: null
    after: "1cd5fe82652a51250290b3dcf6b89265a3b176891981fc591e5c65629397d43c"
    decision: same-version
  - root: "event:product/source-text-v1"
    previous: null
    after: "d9f87a8bbf89a400b86733fdf1e11147b698cf0636299f82c58ea5be63155bb0"
    decision: same-version
  - root: "event:product/verification-v1"
    previous: null
    after: "d5f4ad97e079710f63f37f7167a6a190a019efea1acec8332d39f5f429599c69"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing Session records remain unchanged and readable by the current reader. The new event names are distinct from existing events. A reader without these declarations refuses a new Session containing their non-ignorable events instead of interpreting them as older event types or truncating the log; a reader with the product workflow can read the saved investigation facts and identify an unclosed background task as interrupted.

<a id="verification"></a>
## Verification

Product package tests cover source declarations, report eligibility, cross-source comparison, and restart recovery from committed checkpoints. Real Loader product preset tests cover saved checkpoints, page metadata, and recorded model-visible requests. Persistence catalog, Session format catalog, and released persistence history checks pass.

<a id="dev-note"></a>
## Dev Note

None.
