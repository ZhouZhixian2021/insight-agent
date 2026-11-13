---
kind: upgrade-guide
description: "Product investigations screen source domains before reading and may omit time and page-text limits in new plans."
---

# Product investigation capacity

English | [中文](guide.zh.md)

## Change

New product plans support up to 30 candidate pages and may omit overall elapsed-time and canonical-text limits. Explicitly approved limits still apply. Unapproved external domains are excluded before acquisition, even when a search title names the product. New extraction selects saved-page passages by question without a fixed first-round evidence count per page; a record may contain up to three exact excerpts. Extraction output follows the selected model route capacity without a product-specific token or response-byte cap; transport protection still applies. New model audit records carry plan identity; old records remain readable without inferred associations.

## Migration

1. Restart the local Web service after rebuilding the checkout.
2. Create and approve a new product plan with a candidate-page limit; elapsed-time and page-text limits are optional. Include required external publisher domains in `sourcePublishers`; an official host alone does not approve third-party reviews.
3. Configure the selected model's output limit when the deployment requires one. Without a request limit, extraction reserves 8,192 tokens for context checks while leaving output control to the model route. Unknown context is subject to provider validation.
4. Check the product card process details and download Trace after a run. Historical records without a plan identity may have fewer trace entries.
