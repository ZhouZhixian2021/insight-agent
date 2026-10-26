---
kind: upgrade-guide
description: "Custom Academic Research Controller compositions now require the sessionQuery service."
---
# Academic Research Controller history reads

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-api-academic-research-controller` now requires `sessionQuery` to read approved plans, recovery checkpoints, and background-run history. Custom compositions without that service cannot activate the Controller. The shipped Web composition already provides it.

## Migration

1. In custom `cordis.yml` files or overlays that mount the Controller, provide `sessionQuery` through an existing provider such as [`@deepseek-ai/dsh-session-query-sqlite`](../../../../packages/session-query/session-query-sqlite/README.md). Reuse the configured provider when one is already present.
2. Keep Session storage and its historical files intact. No Session-format conversion is required.
3. Open an approved Academic plan, start research, and refresh the background-run list to confirm that the Controller can read the selected Session. A history-read failure stops dependent research dispatch and must be resolved before retrying.
