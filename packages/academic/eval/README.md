---
description: "Evaluate evidence integrity and reconcile explicit semantic reviews before report delivery."
kind: "package-library"
---

# @deepseek-ai/dsh-academic-eval

English | [中文](README.zh.md)

## Summary

Evaluate evidence integrity and reconcile explicit semantic reviews before report delivery.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Optional `sourceStatements` preserve single-paper attributions without minting cross-paper Claims. Each statement must have support; its references undergo the same current-version, locator, hash and source-depth checks and contribute to independent-work coverage. Source statements always retain a separate semantic-review requirement and cannot authorize final publication.

`evaluateClaims()` — Pass the current brief, claims, links, evidence, versions, locators, review records and evaluation time. The function checks exact snapshot/link membership, freshness, provenance, evidence depth, preprint policy and minimum work counts. Missing or invalid evidence blocks delivery. Valid references without a matching semantic review produce needs_review, never automatic semantic approval. Caller-supplied reviews must come from a trusted reviewer; this function does not authenticate their author.

No invariant companion is published because this library is stateless; automated tests verify output relationships and failure behavior.

<a id="model-experience"></a>
## Model Experience

### Returned result

#### What the model sees

`evaluateClaims()` returns data without issuing model requests.

#### Token effect

No direct tokens. Consumers own subsequent rendering and request logging.

#### KV Cache effect

This package performs no model cache operations.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- No model judge, truth oracle, external retrieval or reviewer authentication. Required-field types are validated at the external input owner.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

See the fixed benchmark and verification in the [development record](../../../z-team_docs/开发记录/2026-09-14-ykxy11-学术报告最小闭环.md)。

</details>
