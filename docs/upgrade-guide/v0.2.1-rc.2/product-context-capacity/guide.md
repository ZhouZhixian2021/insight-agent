---
kind: upgrade-guide
description: "Product investigations screen source domains before reading and retain approved page and time limits."
---

# Product investigation capacity

English | [中文](guide.zh.md)

## Change

New product plans support up to 12 candidate pages and 20 minutes, with an approved canonical-text limit of 12,000–48,000 characters per page. A plan without an explicit page limit retains the 12,000-character default. Unapproved external domains are excluded before acquisition, even when a search title names the product. New extraction selects saved-page passages by question and creates up to eight evidence records per page; a record may contain up to three exact excerpts. Model capacity and transport protection still apply. New model audit records carry plan identity; old records remain readable without inferred associations.

## Migration

1. Restart the local Web service after rebuilding the checkout.
2. Create and approve a new product plan with the candidate, time and page-text limits. Include required external publisher domains in `sourcePublishers`; an official host alone does not approve third-party reviews.
3. Configure the selected model output capacity and context metadata. Unknown context is subject to provider validation, not a guessed capacity.
4. Check the product card process details and download Trace after a run. Historical records without a plan identity may have fewer trace entries.
