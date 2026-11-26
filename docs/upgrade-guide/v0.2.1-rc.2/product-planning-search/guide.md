---
kind: upgrade-guide
description: "Product Insight moves webpage search and reading out of the planning conversation into the approved background investigation."
---

# Product Insight searches after plan approval

English | [中文](guide.zh.md)

## Change

The stock Product Insight planner previously offered `web_search` and `web_fetch`. It now takes the product and focus from the conversation. The approved workflow uses its own Web service to gather and screen links before allocating reading slots. A new focus-plan proposal supplies standalone search queries for each question.

## Migration

1. If a custom product planning prompt asks for a preliminary web search, replace that instruction with the questions the background investigation should look up. In a newly submitted version 2 `product-insight-plan-json` block, put one array of standalone queries per question under `searchQueries`. Previously approved plans keep their recorded query format.
2. Restart the local DSH service and open a new Product Insight chat. Submit a request with a product and focus. The plan appears before any web search. Approving it starts discovery in the investigation card.
