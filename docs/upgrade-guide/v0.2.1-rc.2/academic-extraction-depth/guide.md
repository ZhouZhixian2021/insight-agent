---
kind: upgrade-guide
description: "Academic research defaults to bounded complete evidence extraction instead of five records per paper."
---

# Academic evidence extraction depth

English | [中文](guide.zh.md)

## Change

Formal Academic research runs default to `extractionDepth: complete`. The five-record cap per paper applies only to `minimal` mode. Complete mode prioritizes question-linked source ranges and requests experimental conditions and limitations alongside findings. Existing per-paper call and timeout budgets still apply; model usage and elapsed time can increase. Ranked batches also assess whether evidence answers every requested part before marking a question covered.

## Migration

1. Keep the default to use bounded complete extraction. To retain the five-record mode, set `extractionDepth: minimal` in the existing Academic Research Controller row's complete `config` value in your profile or home patch, preserving its other settings.
2. Restart the application and start a new research run. Existing reports are unchanged. In complete mode, papers may contribute more than five verified records; missing question aspects remain partial and can request another batch or search round.
