# Agent Note: Paper admission precedes focused evidence extraction

Status: implemented

English | [中文](2026-10-11-academic-paper-screening-evidence-phases.zh.md)

## Problem

One model response reviewed paper eligibility, selected exact excerpts, and filled six-section card attributes for every full-text batch. A long paper repeated eligibility judgments across batches, and the combined request could consume its attempt deadline without returning final JSON.

## Decision

The Session-backed generator reviews the first ordered evidence batch once before extraction. The review receives approved paper-level rules, source metadata, the sampled segments, and a `sourceComplete` flag. It returns `included`, `excluded`, or `needs_more_context` with a reason. Exclusion skips extraction; insufficient context pauses the paper without treating it as excluded. An included paper sends question-focused evidence batches without repeating scope rules.

The evidence response contains a source segment index, approved question indexes, one statement, an exact excerpt, and one of six card sections. The workflow validates the compact JSON, maps missing section attributes to `not_extracted`, and delegates exact source matching and card identity creation to the evidence library. The model cannot mint evidence identities or turn an unsupported excerpt into a record.

The existing `academic/evidence-request` and `academic/evidence-result` events persist both calls with a `phase` field. An omitted phase preserves the meaning of historical combined requests. Result records include attempt duration, first-content delay, and a coarse failure phase without storing credentials or inferring the failed network hop.

An evidence request that reaches its local deadline does not repeat the same complete input. When `maxAttempts` exceeds one, the generator replaces that batch with two smaller ordered inputs and does not split either child again. A multi-segment batch splits between segments; a single segment splits at a Unicode character boundary and may retain a bounded overlap. Scope review and provider-reported transient failures keep their existing retry policy. Every attempt remains durably recorded, and successful child evidence is retained if its sibling fails.

## Alternatives considered

**Increase the timeout or retry count alone.** Rejected because repeated long reasoning without final JSON still spends another complete attempt and does not separate paper selection from evidence production.

**Always use fewer source segments.** Rejected because fixed four-segment requests still took 114 and 132 seconds in the same model route, while making every long paper issue more calls even when a larger request would succeed. Smaller input is reserved for a timed-out batch.

**Require the model to populate every card attribute in the evidence call.** Rejected because absent attributes can be represented conservatively as `not_extracted`, while the record and card section remain traceable to an exact quote. Attribute enrichment may be evaluated separately.

**Exclude papers when the sampled scope text is insufficient.** Rejected because missing text is not evidence that an approved rule failed.

## Consequences

One ordinary paper receives an additional short scope call, but excluded papers receive no evidence calls and included papers no longer repeat admission for every batch. Exact-quote rejection remains authoritative. A partial first batch cannot prove that unseen text satisfies every rule; `needs_more_context` pauses the paper, and automatic targeted rescreening is not implemented. Card-specific attributes remain `not_extracted` until a later enrichment step. The Web controller allows 150 seconds per extraction attempt; a timeout split can add two requests and increase the visible batch count, so it improves recovery rather than guaranteeing lower paper latency. Local timing separates preparation, pre-content and post-content failures; gateway logs remain necessary to locate an intermittent upstream connection break.
