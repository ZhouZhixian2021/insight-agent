---
kind: upgrade-guide
description: "Product investigation no longer accepts fallbackRoutes or switches models after a request failure."
---

# Product investigation model fallback

English | [中文](guide.zh.md)

## Change

Product search recognition and background investigation use the model selected in the Session. Model retries keep that selection. The product workflow plugin no longer accepts `fallbackRoutes`; a failed model request does not switch to another model.

## Migration

1. Remove `fallbackRoutes` from any custom `@deepseek-ai/dsh-product-insight-workflow` plugin configuration in profile or preset patches.
2. Select the desired model in the product conversation before approving or resuming the investigation, then restart Web after rebuilding the checkout.
3. Check the saved product model request events to confirm that search recognition, extraction, review, comparison, and synthesis use the selected provider and model.
