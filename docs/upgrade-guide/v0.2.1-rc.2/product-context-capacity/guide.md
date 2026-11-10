---
kind: upgrade-guide
description: "Product investigations screen source domains before reading and use model capacity instead of fixed content quotas."
---

# Product investigation capacity

English | [中文](guide.zh.md)

## Change

New product plans support up to 30 candidate pages and omit total-time and canonical-text limits. Explicit limits in already-approved plans remain enforced. Unapproved external domains are excluded before acquisition, even when a search title names the product. Evidence extraction and report synthesis no longer enforce fixed excerpt counts or character and byte quotas; configured model capacity and transport protection still apply. Model audit records optionally include plan identity; old records remain readable without inferred associations.

## Migration

1. Restart the local Web service after rebuilding the checkout.
2. Create and approve a new product plan to use the new defaults. Include required external publisher domains in `sourcePublishers`; an official host alone does not approve third-party reviews.
3. Configure the selected model output capacity and context metadata. Unknown context is subject to provider validation, not a guessed capacity.
4. Check the product card process details and download Trace after a run. Historical records without a plan identity may have fewer trace entries.
